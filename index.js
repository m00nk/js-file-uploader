/**
 * @author Dmitrij "m00nk" Sheremetjev <m00nk1975@gmail.com>
 * Date: 11.12.2020, Time: 20:39
 */

'use strict'

const md5 = require('md5');
const axios = require('axios');

module.exports = function (opts = {}) {
	if (typeof window == 'undefined' || typeof window.FileReader !== 'function') {
		throw new Error("The file API isn't supported on this browser yet.");
	}

	const params = {
		// URL для загрузки
		url: '',

		// дополнительные заголовки, отправляемые на сервер
		headers: {},

		// объект дополнительных данных, отправляемый при закачке с каждым файлом в поле meta (для обеспечения
		// безопасности, идентификации и т.д.)
		meta: {},

		// флаг авто-старта закачки. Если false, то для начала закачки нужно вызвать  метод start()
		autoStart: true,

		// Тип изображения, которое будет получено после масштабирования и поворота.
		// Варианты:
		// - 'original' - не производить масштабирование и поворот, закачивать изображения как обычные файлы
		// - 'image/jpeg' - конвертировать в JPEG
		// - 'image/webp' - конвертировать в WEBP
		finalImageMime: 'image/jpeg',

		// ширина изображения, к которой оно будет масштабировано (0 - не масштабировать, используется только
		// когда `finalImageMime != 'original'`)
		maxImageWidth: 0,

		// высота изображения, к которой оно будет масштабировано (0 - не масштабировать, используется только
		// когда `finalImageMime != 'original'`)
		maxImageHeight: 0,

		// качество фанального изображения после обработки, используется только когда `finalImageMime != 'original'`
		quality: 70,

		// максимальное количество одновременных закачек
		maxTasks: 3,

		// ширина превьюшки в точках (0 - превьюшки не нужны, используется только когда `finalImageMime != 'original'`)
		thumbWidth: 0,

		// высота превьюшки в точках (0 - превьюшки не нужны, используется только когда `finalImageMime != 'original'`)
		thumbHeight: 0,

		//===========================================

		// вызывается из addFiles перед началом добавления первого файла. Необходим для избавления от паузы, которая возникает с момента вызова addFiles до вызова onStart
		onStartProcessing: null,

		// вызывается после обработки последнего файла в списке переданных в addFiles.
		onEndProcessing: null,

		// вызывается перед добавлением файла в очередь. Для каждого файла, получает объект FileInfo (на данный момент заполнены только поля orig*), ожидает
		// логическое значение - разрешение на добавление в очередь.
		onFileAdd: null,

		// вызывается после успешного добавления файла в очередь. Для каждого файла, получает объект FileInfo
		onFileAdded: null,

		// вызывается в момент начала закачки первого задания из очереди
		onStart: null,

		// вызывается в момент начала закачки очередного файла (получает объект FileInfo файла, закачка которого начата)
		onFileStart: null,

		// вызывается при обновлении данных о прогрессе загрузки файла (получает объект FileInfo закачиваемого файла)
		onProgress: null,

		// вызывается в момент окончания закачки очередного файла (получает объект FileInfo файла, закачка которого завершена)
		onFileUploaded: null,

		// вызывается при ошибке закачки (получает объект FileInfo)
		onUploadError: null,

		// в момент окончания всех заданий в очереди
		onEnd: null
	};

	Object.assign(params, opts);
	if (['original', 'image/jpeg', 'image/webp'].indexOf(params.finalImageMime) < 0) {
		params.finalImageMime = 'image/jpeg';
	}

	return {
		async addFiles(files) {
			this.params.onStartProcessing && this.params.onStartProcessing();
			for (let f of files) {

				const ext = f.name.replace(/(.*\.)/, '');
				const name = f.name.replace(/\.[^.]+/, '');
				let dim = null;

				if (f.type.startsWith('image/')) { // найдено изображение - определяем его размеры
					dim = await getImgDimensions(f);
				}

				const fi = new this.FileInfo({
					origFileName: name,
					origFileExt: ext,
					origMime: f.type,
					origSize: f.size,
					origDate: f.lastModified,
					origWidth: dim ? dim[0] : 0,
					origHeight: dim ? dim[1] : 0,
				});

				if (this.params.onFileAdd == null || this.params.onFileAdd(fi)) {
					let base64data = null;

					fi.fileSize = fi.origSize;
					fi.fileMime = fi.origMime;
					fi.fileExt = fi.origFileExt.toLowerCase();

					if (f.type.startsWith('image/')) { // найдено изображение
						if (this.params.finalImageMime != 'original') {
							const z = await processImage(
								f,
								this.params.maxImageWidth,
								this.params.maxImageHeight,
								this.params.finalImageMime,
								this.params.quality,
								this.params.thumbWidth,
								this.params.thumbHeight
							);

							base64data = z.imgBase64;
							fi.thumb = z.thumbBase64;
							fi.fileSize = z.size;
							fi.fileHeight = z.height;
							fi.fileWidth = z.width;
							fi.fileMime = this.params.finalImageMime;
							fi.fileExt = this.params.finalImageMime == 'image/jpeg' ? 'jpg' : 'webp';
						}
						else {
							fi.fileHeight = fi.origHeight;
							fi.fileWidth = fi.origWidth;
						}
					}

					if (base64data == null) { // читаем файл
						base64data = await (new Promise(r => {
							const fr = new FileReader();
							fr.onload = (e) => {
								r(e.target.result);
							}
							fr.readAsDataURL(f);
						}));
					}

					fi.fileHash = md5(base64data);

					//-------------------------------------------
					this.uploadQueue.push({info: fi, base64data});

					this.params.onFileAdded && this.params.onFileAdded(fi);

				}
			}

			if (this.params.autoStart) {
				this.start();
			}

			this.params.onEndProcessing && this.params.onEndProcessing();
		},

		start() {
			if (!this.isUploading && this.uploadQueue.length > 0) {
				this.isUploading = true;
				this.params.onStart && this.params.onStart();
			}
			uploadNextFile(this);
		},

		FileInfo: class  {
			/**
			 * заполняем данными существующие поля объекта
			 *
			 * @param p данные для объекта
			 */
			load(p) {
				p = Object.assign({}, p);

				if (typeof p === 'object') {
					const availableKeys = Object.keys(this);
					for (let key in p) {
						if (availableKeys.indexOf(key) >= 0) {
							this[key] = p[key];
						}
					}
				}
			}

			constructor(data) {
				this.guid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
					var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
					return v.toString(16);
				});

			// оригинальное имя файла (без расширения)
			this.origFileName = '';

			// оригинальное расширение файла
			this.origFileExt = '';

			// оригинальный mime-тип файла
			this.origMime = '';

			// оригинальный размер файла в байтах
			this.origSize = 0;

			// оригинальная ширина изображения в точках
			this.origWidth = 0;

			// оригинальная высота изображения в точках
			this.origHeight = 0;

			// оригинальная дата создания файла
			this.origDate = null;

			// хэш на базе финального содержимого и оригинального имени файла
			this.fileHash = '';

			// финальное расширение файла в нижнем регистре (для масштабированных изображений всегда jpg)
			this.fileExt = '';

			// финальный размер файла в байтах (для изображений - после масштабирования)
			this.fileSize = 0;

			// финальная ширина изображения в точках (после масштабирования)
			this.fileWidth = 0;

			// финальная высота изображения в точках (после масштабирования)
			this.fileHeight = 0;

			// финальный mime-тип файла (для масштабированных изображений всегда image/jpeg)
			this.fileMime = '';

			// base64-кодированная превьюшка
			this.thumb = null;

			// статус (pending, uploading, success, error)
			this.status = 'pending';

			// прогресс загрузки в процентах
			this.progress = 0;

			// текст ошибки либо пустая строка
			this.error = '';

			// имя файла на сервере с расширением (доступно только после загрузки, пустая строка при ошибке)
			this.filename = '';

			// URL загруженного файла (доступно только после загрузки если разрешено его получать, пустая строка при ошибке)
			this.url = '';


				this.load(data);
			}
		},


		//-------------------------------------------
		params,
		isUploading: false,
		uploadQueue: [],
		nowUploading: 0,
		timer: null,
	}
}

//===========================================
/**
 * Закачиваем следующий файл
 * @param obj
 */
function uploadNextFile(obj) {
	if (obj.uploadQueue.length == 0) {
		return;
	}

	if (obj.nowUploading < obj.params.maxTasks && obj.nowUploading < obj.uploadQueue.length) {
		const task = obj.uploadQueue[obj.nowUploading];
		obj.nowUploading++;

		const data = Object.assign({}, task.info);
		data.base64data = task.base64data;
		data.meta = obj.params.meta;

		delete data.thumb;
		delete data.status;
		delete data.progress;
		delete data.error;
		delete data.filename;
		delete data.url;

		task.info.progress = 0;
		task.info.status = 'uploading';

		obj.params.onFileStart && obj.params.onFileStart(task.info);

		uploadNextFile(obj);

		//-------------------------------------------
		const reqParams = {
			headers: obj.params.headers,
			withCredentials: true,
			onUploadProgress: (progressEvent) => {
				task.info.progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
				obj.params.onProgress && obj.params.onProgress(task.info);
			}
		}

		axios.post(obj.params.url, data, reqParams)
			.then(res => {
				if (res.data.status == 'ok') {
					task.info.error = '';
					task.info.progress = 100;
					task.info.status = 'success';
					task.info.filename = res.data.filename;
					task.info.url = res.data.url;

					obj.params.onFileUploaded && obj.params.onFileUploaded(task.info);
				}
				else {
					task.info.progress = 0;
					task.info.status = 'error';
					task.info.error = res.data.error;
					obj.params.onUploadError && obj.params.onUploadError(task.info);
				}
			})
			.catch(err => {
				task.info.progress = 0;
				task.info.status = 'error';
				task.info.error = 'Could not upload file - server error';
				obj.params.onUploadError && obj.params.onUploadError(task.info);
			})
			.finally(() => {
				obj.nowUploading--;
				obj.uploadQueue = obj.uploadQueue.filter(v => v.info.guid != task.info.guid);
				checkForEndOfUploading(obj);
			})
		;
	}
}

/**
 * Проверка на окончание закачки очереди
 * @param obj
 */
function checkForEndOfUploading(obj) {
	if (obj.nowUploading == 0 && obj.uploadQueue.length == 0) {

		// убиваем старый таймер, чтобы не дублировать события
		if (obj.timer != null) {
			clearTimeout(obj.timer);
		}

		// даем паузу, вдруг еще что-то добавится?
		obj.timer = setTimeout(() => {
			obj.isUploading = false;
			obj.params.onEnd && obj.params.onEnd();
			obj.timer = null;
		}, 200)
	}
	else {
		uploadNextFile(obj);
	}
}

/**
 * Определяет размер изображения в точках
 *
 * @param file
 * @returns {Promise<[{int}, {int}]>}
 */
function getImgDimensions(file) {
	return new Promise((resolve) => {
		let img = document.createElement("img");
		img.src = window.URL.createObjectURL(file);
		img.onload = function () {
			const out = [img.width, img.height];
			window.URL.revokeObjectURL(img.src);
			img.src = ''; // чистим память
			resolve(out);
		};
	});
}

/**
 * Поворачивает изображение в соответствии с EXIF, масштабирует в соответствии с параметрами.
 * На входе получает объект, полученный из <input type="file">
 * Возвращает промис, который вернет объект:
 * {
 *     imgBase64 - строка с финальным изображением в base64
 *     thumbBase64 - cстрока с изображением превьюшки в base64
 * }
 */
function processImage(file, maxWidth = 0, maxHeight = 0, mime = 'image/jpeg', quality = 70, thumbWidth = 0, thumbHeight = 0) {
	return new Promise((resolve) => {
		let fileItem = {
			imgBase64: null,
			thumbBase64: null,
			width: 0,
			height: 0,
			size: 0,
		};

		let img = document.createElement("img");
		img.src = window.URL.createObjectURL(file);
		img.onload = function () {
			fileItem.width = img.width;
			fileItem.height = img.height;
			fileItem.size = file.size;

			let fileReader = new FileReader();
			fileReader.onload = function (e) {
				let orientation = getOrientation(e.target.result);
				if (orientation < 1) orientation = 1;

				let z = getResizedImage(img, maxWidth, maxHeight, mime, quality / 100, orientation);
				fileItem.width = z.width;
				fileItem.height = z.height;
				fileItem.imgBase64 = z.data;
				fileItem.size = Math.round(z.data.length * 3 / 4);

				if (thumbWidth > 0 || thumbHeight > 0) {
					z = getResizedImage(img, thumbWidth, thumbHeight, mime, quality / 100, orientation);
					fileItem.thumbBase64 = z.data;
				}

				// принудительная очистка памяти
				window.URL.revokeObjectURL(img.src);
				img.src = '';

				resolve(fileItem);
			};
			fileReader.readAsArrayBuffer(file);
		};
	});
}

/**
 * Масштабирует и поворачивает изображение
 *
 * @param img
 * @param maxW
 * @param maxH
 * @param mime
 * @param quality
 * @param orientation
 * @returns {{data: string, width: number, height: number}}
 */
function getResizedImage(img, maxW = 0, maxH = 0, mime = 'image/jpeg', quality, orientation) {
	const canvas = document.createElement('canvas');

	let iW = img.width;
	let iH = img.height;

	maxW = maxW == 0 ? iW : maxW;
	maxH = maxH == 0 ? iH : maxH;

	if (iW > maxW) {
		iH *= maxW / iW;
		iW = maxW;
	}

	if (iH > maxH) {
		iW *= maxH / iH;
		iH = maxH;
	}

	iW = parseInt(iW);
	iH = parseInt(iH);

	let cW = iW, cH = iH;

	if (orientation > 4) {
		cW = iH;
		cH = iW;
	}

	let angle = 0;
	switch (orientation) {
		case 3:
		case 4:
			angle = Math.PI;
			break;
		case 5:
		case 6:
			angle = Math.PI / 2;
			break;
		case 7:
		case 8:
			angle = -Math.PI / 2;
			break;
	}

	canvas.width = cW;
	canvas.height = cH;

	let ctx = canvas.getContext('2d');

	ctx.translate(canvas.width / 2, canvas.height / 2);
	ctx.rotate(angle);

	ctx.drawImage(img, -iW / 2, -iH / 2, iW, iH);

	ctx.rotate(-angle);
	ctx.translate(-canvas.width / 2, -canvas.height / 2);

	let out = canvas.toDataURL(mime, quality);

	// принудительная очистка памяти
	canvas.width = 1;
	canvas.height = 1;
	canvas.remove();

	return {data: out, width: cW, height: cH};
}

const EXIF_FILE_IS_NOT_JPEG = -2;
const EXIF_ORIENTATION_IS_NOT_DEFINED = -1;

/**
 * EXIF может кодировать 8 различных ориентаций. Отраженные варианты - это всегда зеркальное отражение
 * нормального изображения по горизонтали. Это означает, что для зеркалированных изображений нужно
 * сперва повернуть изображение, а потом отзеркалить горизонтально.
 *
 * 1 - правильная ориентация
 * 2 - правильная ориентация зеркальная
 * 3 - поворот на 180 градусов
 * 4 - поворот на 180 градусов зеркальный
 * 5 - поворот на 90 против часовой зеркальный
 * 6 - поворот на 90 против часовой
 * 7 - поворот на 90 по часовой зеркальный
 * 8 - поворот на 90 по часовой
 *
 * поясняющая картинка: https://i.stack.imgur.com/VGsAj.gif
 */
function getOrientation(fileReaderResult) {
	let view = new DataView(fileReaderResult);
	if (view.getUint16(0, false) != 0xFFD8) {
		return EXIF_FILE_IS_NOT_JPEG;
	}

	let length = view.byteLength, offset = 2;
	while (offset < length) {
		if (view.getUint16(offset + 2, false) <= 8) {
			return EXIF_ORIENTATION_IS_NOT_DEFINED;
		}

		let marker = view.getUint16(offset, false);
		offset += 2;
		if (marker == 0xFFE1) {
			if (view.getUint32(offset += 2, false) != 0x45786966) {
				return EXIF_ORIENTATION_IS_NOT_DEFINED;
			}

			let little = view.getUint16(offset += 6, false) == 0x4949;
			offset += view.getUint32(offset + 4, little);
			let tags = view.getUint16(offset, little);
			offset += 2;
			for (let i = 0; i < tags; i++) {
				if (view.getUint16(offset + (i * 12), little) == 0x0112) {
					return view.getUint16(offset + (i * 12) + 8, little);
				}
			}
		}
		else if ((marker & 0xFF00) != 0xFF00) {
			break;
		}
		else {
			offset += view.getUint16(offset, false);
		}
	}
	return EXIF_ORIENTATION_IS_NOT_DEFINED;
}

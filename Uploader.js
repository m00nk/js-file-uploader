/**
 * @author Dmitrij "m00nk" Sheremetjev <m00nk1975@gmail.com>
 * Date: 30.05.2021, Time: 20:52
 */

'use strict'

const md5 = require('md5');
const axios = require('axios');
const cloneDeep = require('lodash/cloneDeep');

const BaseClass = require('./BaseClass');
const FileInfo = require('./FileInfo');

class Uploader extends BaseClass {

	// URL для загрузки
	url = '';

	// дополнительные заголовки, отправляемые на сервер
	headers = {};

	// объект дополнительных данных, отправляемый при закачке с каждым файлом в поле meta (для обеспечения
	// безопасности, идентификации и т.д.)
	meta = {};

	// Тип изображения, которое будет получено после масштабирования и поворота.
	// Варианты:
	// - 'original' - не производить масштабирование и поворот, закачивать изображения как обычные файлы
	// - 'image/jpeg' - конвертировать в JPEG
	// - 'image/webp' - конвертировать в WEBP
	finalImageMime = 'image/jpeg';

	// ширина изображения, к которой оно будет масштабировано (0 - не масштабировать, используется только
	// когда `finalImageMime != 'original'`)
	maxImageWidth = 0;

	// высота изображения, к которой оно будет масштабировано (0 - не масштабировать, используется только
	// когда `finalImageMime != 'original'`)
	maxImageHeight = 0;

	// качество фанального изображения после обработки, используется только когда `finalImageMime != 'original'`
	quality = 70;

	// максимальное количество одновременных закачек
	maxTasks = 3;

	// ширина превьюшки в точках (0 - превьюшки не нужны, используется только когда `finalImageMime != 'original'`)
	thumbWidth = 0;

	// высота превьюшки в точках (0 - превьюшки не нужны, используется только когда `finalImageMime != 'original'`)
	thumbHeight = 0;

	//===========================================

	/** @var {boolean} флаг идущего процесса закачки */
	#isUploading = false;

	/** @var {FileInfo[]} очередь закачки */
	#uploadQueue = [];

	/** @var {number} Количество файлов, которые находятся в состоянии закачки в данный момент */
	#nowUploading = 0;

	//===========================================
	constructor(opts = {}) {
		super();

		if(typeof window == 'undefined' || typeof window.FileReader !== 'function') {
			throw new Error("The file API isn't supported on this browser yet.");
		}

		this.load(opts);

		if(['original', 'image/jpeg', 'image/webp'].indexOf(this.finalImageMime) < 0) {
			this.finalImageMime = 'image/jpeg';
		}
	}

	//===============================================
	// <editor-fold desc="Хуки">
	//-----------------------------------------------

	/**
	 * Вызывается перед началом обработки очередного файла. Получает объект FileInfo (на данный момент
	 * заполнены только поля orig*). Должен вернуть логическое значение - разрешение на продолжение обработки.
	 *
	 * @param {FileInfo} fInfo
	 *
	 * @returns {boolean}
	 */
	beforeFileProcessing = null;

	/**
	 * Вызывается после завершения обработки файла. Для каждого файла, получает полностью заполненный объект
	 * FileInfo. Должен вернуть логическое значение - разрешение на добавление в очередь.
	 *
	 * @param {FileInfo} fInfo
	 *
	 * @returns {boolean}
	 */
	afterFileProcessing = null;

	/**
	 * В момент окончания всех заданий в очереди
	 */
	onEnd = null;

	/**
	 * Вызывается в момент начала закачки очередного файла (получает объект FileInfo файла, закачка которого начата)
	 *
	 * @param {FileInfo} fInfo
	 */
	onFileStart = null;

	/**
	 * Вызывается при обновлении данных о прогрессе загрузки файла (получает объект FileInfo закачиваемого файла).
	 * Значение прогресса находится в `fInfo.progress`
	 *
	 * @param {FileInfo} fInfo
	 */
	onProgress = null;

	/**
	 * Вызывается в момент окончания закачки очередного файла.
	 * В этот момент объект `FileInfo` уже содержит ответ сервера.
	 *
	 * @param {FileInfo} fInfo
	 */
	onFileUploaded = null;

	/**
	 * Вызывается при ошибке закачки.
	 * В этот момент объект `FileInfo` уже содержит текст ошибки, которую вернул сервер (в поле `error`).
	 *
	 * @param {FileInfo} fInfo
	 */
	onUploadError = null;

	//-----------------------------------------------
	// </editor-fold>
	//===============================================

	async addFiles(files) {
		const fInfos = [];

		for(let f of files) {
			const ext = f.name.replace(/(.*\.)/, '');
			const name = f.name.replace(/\.[^.]+/, '');
			let dim = null;

			if(f.type.startsWith('image/')) { // найдено изображение - определяем его размеры
				dim = await Uploader._getImgDimensions(f);
			}

			const fi = new FileInfo({
				origFileName: name,
				origFileExt: ext,
				origMime: f.type,
				origSize: f.size,
				origDate: f.lastModified,
				origWidth: dim ? dim[0] : 0,
				origHeight: dim ? dim[1] : 0,
			});

			if(this.beforeFileProcessing == null || this.beforeFileProcessing(fi)) {
				fInfos.push({f, fi});
			}
		}

		for(let {f, fi} of fInfos) {
			if(fi.status == FileInfo.STATUS_PENDING) { // на случай если код клиента изменил статус
				let base64data = null;

				fi.fileSize = fi.origSize;
				fi.fileMime = fi.origMime;
				fi.fileExt = fi.origFileExt.toLowerCase();

				if(f.type.startsWith('image/')) { // найдено изображение
					if(this.finalImageMime != 'original') {
						const z = await Uploader._processImage(
							f,
							this.maxImageWidth,
							this.maxImageHeight,
							this.finalImageMime,
							this.quality,
							this.thumbWidth,
							this.thumbHeight
						);

						base64data = z.imgBase64;
						fi.thumb = z.thumbBase64;
						fi.fileSize = z.size;
						fi.fileHeight = z.height;
						fi.fileWidth = z.width;
						fi.fileMime = this.finalImageMime;
						fi.fileExt = this.finalImageMime == 'image/jpeg' ? 'jpg' : 'webp';
					}
					else {
						fi.fileHeight = fi.origHeight;
						fi.fileWidth = fi.origWidth;
					}
				}

				if(base64data == null) { // это не изображение - читаем как обычный файл
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
				if(this.afterFileProcessing == null || this.afterFileProcessing(fi)) {
					this.#uploadQueue.push({info: fi, base64data});
				}
			}
		}
	}

	start() {
		if(!this.#isUploading && this.#uploadQueue.length > 0) {
			this.#isUploading = true;
		}
		this._uploadNextFile();
	}

	/**
	 * Закачиваем следующий файл
	 */
	_uploadNextFile() {
		this._checkForEndOfUploading();
		if(!this.#isUploading) {
			return;
		}

		if(this.#nowUploading < this.maxTasks && this.#nowUploading < this.#uploadQueue.length) {
			const task = this.#uploadQueue[this.#nowUploading];

			if(task.info.status == 'pending') { // на случай, если в хуках клиентский код сменил статус
				this.#nowUploading++;

				const data = new FileInfo(task.info);
				data.base64data = task.base64data;
				data.meta = this.meta;

				delete data.thumb;
				delete data.status;
				delete data.progress;
				delete data.error;
				delete data.filename;
				delete data.url;

				task.info.progress = 0;
				task.info.status = FileInfo.STATUS_UPLOADING;

				this.onFileStart != null && this.onFileStart(task.info);

				const reqParams = {
					headers: cloneDeep(this.headers),
					withCredentials: true,
					onUploadProgress: (progressEvent) => {
						task.info.progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
						this.onProgress != null && this.onProgress(task.info);
					}
				}

				axios.post(this.url, data, reqParams)
					.then(res => {
						if(res.data.status == 'ok') {
							task.info.error = '';
							task.info.progress = 100;
							task.info.status = FileInfo.STATUS_SUCESS;
							task.info.filename = res.data.filename;
							task.info.url = res.data.url;

							this.onFileUploaded != null && this.onFileUploaded(task.info);
						}
						else {
							task.info.progress = 0;
							task.info.status = FileInfo.STATUS_ERROR;
							task.info.error = res.data.error;
							this.onUploadError != null && this.onUploadError(task.info);
						}
					})
					.catch(err => {
						task.info.progress = 0;
						task.info.status = FileInfo.STATUS_ERROR;
						task.info.error = 'Could not upload file - server error';
						this.onUploadError != null && this.onUploadError(task.info);
					})
					.finally(() => {
						this.#nowUploading--;
						this.#uploadQueue = this.#uploadQueue.filter(v => v.info.guid != task.info.guid);
						this._uploadNextFile();
					});
			}
			else { // удаляем "неправильные" закачки
				this.#uploadQueue = this.#uploadQueue.filter(v => v.info.guid != task.info.guid);
			}

			this._uploadNextFile();
		}
	}

	/**
	 * Проверка на окончание закачки очереди
	 */
	_checkForEndOfUploading() {
		if(this.#uploadQueue.length == 0) {
			this.#isUploading = false;
			this.onEnd != null && this.onEnd();
		}
	}

	/**
	 * Определяет размер изображения в точках
	 *
	 * @param file
	 *
	 * @returns {Promise<[{int}, {int}]>}
	 */
	static _getImgDimensions(file) {
		return new Promise((resolve) => {
			let img = document.createElement("img");
			img.src = window.URL.createObjectURL(file);
			img.onload = function() {
				const out = [img.width, img.height];
				window.URL.revokeObjectURL(img.src);
				img.src = ''; // чистим память
				resolve(out);
			};
		});
	}

	/**
	 * Поворачивает изображение в соответствии с EXIF, масштабирует в соответствии с параметрами.
	 * На входе получает объект, полученный из <input type="file">.
	 *
	 * Возвращает промис, который вернет структуру:
	 * {
	 *     imgBase64 - строка с финальным изображением в base64
	 *     thumbBase64 - строка с изображением превьюшки в base64
	 *     width - ширина финального изображения
	 *     height - высота финального изображения
	 *     size - примерная длина файла в байтах
	 * }
	 *
	 * @param file
	 * @param maxWidth
	 * @param maxHeight
	 * @param mime
	 * @param quality
	 * @param tWidth
	 * @param tHeight
	 *
	 * @returns {Promise<{object}>}
	 */
	static _processImage(file, maxWidth = 0, maxHeight = 0, mime = 'image/jpeg', quality = 70, tWidth = 0, tHeight = 0) {
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
			img.onload = function() {
				fileItem.width = img.width;
				fileItem.height = img.height;
				fileItem.size = file.size;

				let fileReader = new FileReader();
				fileReader.onload = function(e) {
					let orientation = Uploader._getOrientation(e.target.result);
					if(orientation < 1) orientation = 1;

					let z = Uploader._getResizedImage(img, maxWidth, maxHeight, mime, quality / 100, orientation);
					fileItem.width = z.width;
					fileItem.height = z.height;
					fileItem.imgBase64 = z.data;
					fileItem.size = Math.round(z.data.length * 3 / 4);

					if(tWidth > 0 || tHeight > 0) {
						z = Uploader._getResizedImage(img, tWidth, tHeight, mime, quality / 100, orientation);
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
	 *
	 * @returns {{data: string, width: number, height: number}}
	 */
	static _getResizedImage(img, maxW = 0, maxH = 0, mime = 'image/jpeg', quality, orientation) {
		const canvas = document.createElement('canvas');

		let iW = img.width;
		let iH = img.height;

		maxW = maxW == 0 ? iW : maxW;
		maxH = maxH == 0 ? iH : maxH;

		if(iW > maxW) {
			iH *= maxW / iW;
			iW = maxW;
		}

		if(iH > maxH) {
			iW *= maxH / iH;
			iH = maxH;
		}

		iW = parseInt(iW);
		iH = parseInt(iH);

		let cW = iW, cH = iH;

		if(orientation > 4) {
			cW = iH;
			cH = iW;
		}

		let angle = 0;
		switch(orientation) {
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
	 *
	 * Значение меньше 0 означает ошибку определения ориентации
	 */
	static _getOrientation(fileReaderResult) {
		let view = new DataView(fileReaderResult);
		if(view.getUint16(0, false) != 0xFFD8) {
			return -2;
		}

		let length = view.byteLength, offset = 2;
		while(offset < length) {
			if(view.getUint16(offset + 2, false) <= 8) {
				return -1;
			}

			let marker = view.getUint16(offset, false);
			offset += 2;
			if(marker == 0xFFE1) {
				if(view.getUint32(offset += 2, false) != 0x45786966) {
					return -1;
				}

				let little = view.getUint16(offset += 6, false) == 0x4949;
				offset += view.getUint32(offset + 4, little);
				let tags = view.getUint16(offset, little);
				offset += 2;
				for(let i = 0; i < tags; i++) {
					if(view.getUint16(offset + (i * 12), little) == 0x0112) {
						return view.getUint16(offset + (i * 12) + 8, little);
					}
				}
			}
			else if((marker & 0xFF00) != 0xFF00) {
				break;
			}
			else {
				offset += view.getUint16(offset, false);
			}
		}
		return -1;
	}
}

module.exports = Uploader;

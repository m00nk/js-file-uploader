/**
 * @author Dmitrij "m00nk" Sheremetjev <m00nk1975@gmail.com>
 * Date: 30.05.2021, Time: 20:42
 */

const BaseClass = require('./BaseClass');

class FileInfo extends BaseClass {
	guid = '';

	// оригинальное имя файла (без расширения)
	origFileName = '';

	// оригинальное расширение файла
	origFileExt = '';

	// оригинальный mime-тип файла
	origMime = '';

	// оригинальный размер файла в байтах
	origSize = 0;

	// оригинальная ширина изображения в точках
	origWidth = 0;

	// оригинальная высота изображения в точках
	origHeight = 0;

	// оригинальная дата создания файла
	origDate = null;

	// хэш на базе финального содержимого и оригинального имени файла
	fileHash = '';

	// финальное расширение файла в нижнем регистре (для масштабированных изображений всегда jpg)
	fileExt = '';

	// финальный размер файла в байтах (для изображений - после масштабирования)
	fileSize = 0;

	// финальная ширина изображения в точках (после масштабирования)
	fileWidth = 0;

	// финальная высота изображения в точках (после масштабирования)
	fileHeight = 0;

	// финальный mime-тип файла (для масштабированных изображений всегда image/jpeg)
	fileMime = '';

	// base64-кодированная превьюшка
	thumb = null;

	// статус (pending, uploading, success, error)
	status = '';

	// прогресс загрузки в процентах
	progress = 0;

	// текст ошибки либо пустая строка
	error = '';

	// имя файла на сервере с расширением (доступно только после загрузки, пустая строка при ошибке)
	filename = '';

	// URL загруженного файла (доступно только после загрузки если разрешено его получать, пустая строка при ошибке)
	url = '';

	// base64-кодированные данные файла
	base64data = '';

	//===============================================
	// <editor-fold desc="Константы">
	//-----------------------------------------------
	static get STATUS_PENDING() { return 'pending'; }

	static get STATUS_UPLOADING() { return 'uploading'; }

	static get STATUS_SUCESS() { return 'success'; }

	static get STATUS_ERROR() { return 'error'; }

	//-----------------------------------------------
	// </editor-fold>
	//===============================================

	constructor(data) {
		super();

		this.guid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
			let r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
			return v.toString(16);
		});

		this.status = this.constructor.STATUS_PENDING;

		this.load(data);
	}
}

module.exports = FileInfo;

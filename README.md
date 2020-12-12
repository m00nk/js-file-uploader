# Многопоточный универсальный загрузчик файлов

Этот класс предназначен для загрузки файлов на сервер. Кроме одновременной
закачки файлов из очереди он умеет обрабатывать изображения на клиенте
(масштабирование, поворот, вырезание EXIF). В этом случае изображение
принудительно конвертируется в JPEG или WEBP.

**_Внимание!_**
_Формат WEBP на данный момент поддерживается только в броузере Google Chrome._

**_Внимание!_**
_Все загружаемые файлы передаются в виде base64-строк, что примерно на 30%
увеличивает объем передаваемого трафика._

Класс имеет развитую систему сообщений через коллбэки, что позволяет вынести
часть логики (проверку типов файлов, размеров, блокировки закачки дубликатов и
т.д.) в вызывающий код. Например, это позволяет гибко управлять отбором файлов,
отображением сообщений и т.д.

Это позволяет создавать компоненты-обертки, которые инкапсулируют часть работы.
Например так можно легко реализовать в компоненте перетаскивание файлов из
проводника или отображение иконок файлов с превьюшками и/или указанием состояния
закачки каждого файла.

При загрузке на сервер отправляется объект файла, дополнительно содержащий поля:

- **base64data** - base64-кодированное содержимое файла

- **meta** - дополнительные данные, необходимыми для безопасности

Следует учесть, что в отправляемом на сервер объекте отсутствуют поля:

- **thumb** - base64-кодированная превьюшка

- **status** - статус (pending, uploading, success, error)

- **progress** - прогресс загрузки в процентах (целое 0 - 100)

- **error** - текст ошибки либо пустая строка

- **filename** - имя файла на сервере с расширением (доступно только после
  загрузки, пустая строка при ошибке)

- **url** - URL загруженного файла (доступно только после загрузки если
  разрешено его получать, пустая строка при ошибке)

### Параметры

- **url** - URL для загрузки

- **headers** - дополнительные заголовки, отправляемые на сервер

- **meta** - объект дополнительных данных, отправляемый при закачке с каждым
  файлом в поле meta (для обеспечения безопасности, идентификации и т.д.)

- **autoStart** - флаг авто-старта закачки. Если false, то для начала закачки
  нужно вызвать метод start()

- **finalImageMime** - Тип изображения, которое будет получено после
  масштабирования и поворота.

  Варианты:
	- '**original**' - не производить масштабирование и поворот, закачивать
	  изображения как обычные файлы
	- '**image/jpeg**' - конвертировать в JPEG
	- '**image/webp**' - конвертировать в WEBP


- **maxImageWidth** - ширина изображения, к которой оно будет масштабировано (0
	- не масштабировать, используется только
	  когда `finalImageMime != 'original'`)

- **maxImageHeight** - высота изображения, к которой оно будет масштабировано (0
	- не масштабировать, используется только
	  когда `finalImageMime != 'original'`)

- **quality** - качество JPEG или WEBP (используется только при масштабировании,
  используется только когда `finalImageMime  != 'original'`)

- **maxTasks** - максимальное количество одновременных закачек

- **thumbWidth** - ширина превьюшки в точках (0 - превьюшки не нужны,
  используется только когда `finalImageMime != 'original'`)

- **thumbHeight** - высота превьюшки в точках (0 - превьюшки не нужны,
  используется только когда`finalImageMime != 'original'`)

##### Коллбэки событий

Ни один из коллбэков не является обязательным.

Многие из коллбэков получают в качестве параметра объект `FileInfo`. Данный
объект передается по ссылке, соответсвенно можно отслеживать изменения данных,
не используя обработчики. Но нельзя изменять содержимое этого объекта до
окончания загрузки, т.к. это может привести к трудноуловимым ошибкам.

- **onFileAdd(FileInfo fInfo)** - вызывается перед добавлением файла в очередь.

  В полученном объекте **FileInfo** заполнены только поля `orig*`. Метод должен
  вернуть логическое значение - разрешение на добавление в очередь.

- **onFileAdded(FileInfo fInfo)** - вызывается после успешного добавления файла
  в очередь. Объект **FileInfo** содержит корректно заполненные поля.

- **onStart()** - вызывается в момент начала закачки первого задания из очереди

- **onFileStart(FileInfo fInfo)** - вызывается в момент начала закачки
  очередного файла

- **onProgress(FileInfo fInfo)** - вызывается при обновлении данных о прогрессе
  загрузки файла. Значение прогресса находится в `fInfo.progress`.

- **onFileUploaded(FileInfo fInfo)** - вызывается в момент окончания закачки
  очередного файла. В этот момент объект **FileInfo** уже содержит ответ
  сервера.

- **onUploadError(FileInfo fInfo)** - при ошибке закачки. В этот момент
  объект **FileInfo** уже содержит текст ошибки, которую вернул сервер (в
  поле `error`).

- **onEnd()** - в момент окончания всех заданий в очереди

### Методы

- **addFiles(files)** - Асинхронный метод. Добавляет файлы в очередь. Для
  каждого файла будет вызван коллбэк **onFileAdded**

- **start()** - начинает процесс закачки

### Объект файла (FileInfo)

- **guid** - уникальный идентификатор задачи (пример: '
  a8e9034e-ce4b-4329-a734-80252fcc89d4')

- **origFileName** - оригинальное имя файла (без расширения)

- **origFileExt** - оригинальное расширение файла

- **origMime** - оригинальный mime-тип файла

- **origSize** - оригинальный размер файла в байтах

- **origWidth** - оригинальная ширина изображения в точках

- **origHeight** - оригинальная высота изображения в точках

- **origDate** - оригинальная дата создания файла

- **fileHash** - хэш на базе финального содержимого. Можно использовать для
  отлова дубликатов.

- **fileExt** - финальное расширение файла в нижнем регистре (для
  масштабированных изображений это jpg или webp)

- **fileSize** - финальный размер файла в байтах (для изображений - после
  масштабирования)

- **fileWidth** - финальная ширина изображения в точках (после масштабирования)

- **fileHeight** - финальная высота изображения в точках (после масштабирования)

- **fileMime** - финальный mime-тип файла (для масштабированных изображений это
  будет image/jpeg или image/webp)

- **thumb** - base64-кодированная превьюшка

- **status** - статус (pending, uploading, success, error)

- **progress** - прогресс загрузки в процентах

- **error** - текст ошибки либо пустая строка

- **filename** - имя файла на сервере с расширением (доступно только после
  загрузки, пустая строка при ошибке)

- **url** - URL загруженного файла (доступно только после загрузки если
  разрешено его получать, пустая строка при ошибке)

### Ответ сервера

Сервер после загрузки должен прислать объект (поля под эти данные имеются в
объекте `FileInfo`, но до окончания загрузки они пустые):

- **status** - статус результата. При нормальном окончании это поле должно
  содержать строку 'ok'. Любое другое значение означает ошибку, при этом текст
  ошибки должен быть помещен в поле `error`

- **guid** - уникальный идентификатор задачи. Пример:
  'a8e9034e-ce4b-4329-a734-80252fcc89d4'

- **filename** - имя файла на сервере с расширением (пустая строка при ошибке)

- **url** - URL загруженного файла (если разрешено его получать, пустая строка
  при ошибке)

- **error** - текст ошибки или пустая строка

## Пример использования

### Клиентский код

```javascript
const uploaderFunc = require('moonk-file-uploader');

try {
	const uploader = uploaderFunc({
		url: 'https://mysite.com/upload',

		// блокируем автозапуск закачки
		autoStart: false,

		// добавляем обработчик для фильтрации неугодных файлов
		onFileAdd: (fi) => {
			// например, разрешаем загрузку только JPEG
			return fi.origMime == 'image/jpeg';
		},

		...
	});


	// добавляем файлы (список получен из <input type="file" />)
	await uploader.addFiles(files);

	// стартуем закачку
	uploader.start();
}
catch (e) {
	alert('Броузер не поддерживает интерфейс чтения файлов.');
} 
```

### Серверная чать (nodejs)

```javascript
// где-то внутри обработчика запроса

let imgBase64 = request.body.base64data;

// собираем простое уникальное имя файла
const filename = request.body.fileHash + '.' + request.body.fileExt;

// пока будем складывать в /tmp
const fullPath = '/tmp/' + filename;

// отрезаем заголовок
const dataPos = imgBase64.indexOf(',');
imgBase64 = imgBase64.substr(dataPos + 1);

try {
	const buff = new Buffer(imgBase64, 'base64');

	const fs = require('fs');
	fs.writeFileSync(fullPath, buff);

	return {
		status: 'ok', // флаг удачного выполнения
		guid: request.body.guid,
		filename,
		url: 'https://mysite.com/download/' + filename,
		error: ''
	}
}
catch (e) {
	return {
		status: 'error', // флаг ошибки
		guid: request.body.guid,
		filename: '',
		url: '',
		error: e.message
	}
}

```

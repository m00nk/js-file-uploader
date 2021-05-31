/**
 * @author Dmitrij "m00nk" Sheremetjev <m00nk1975@gmail.com>
 * Date: 30.05.2021, Time: 20:38
 */

const cloneDeep = require('lodash/cloneDeep');

class BaseClass {
	/**
	 * заполняем данными только существующие поля объекта
	 *
	 * @param {object} data данные для объекта
	 */
	load(data) {
		if(data != null && typeof data === 'object') {
			data = cloneDeep(data);

			for(let key in data) {
				if(this.hasOwnProperty(key)) {
					this[key] = data[key];
				}
			}
		}
	}
}

module.exports = BaseClass;

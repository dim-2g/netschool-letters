const puppeteer = require('puppeteer');
const requestPromise = require('request-promise');
const {config: {login, pass, url, api, timeStart, timeEnd}} = require('./config');

/*
* Проверяем допустимое ли сейчас время для отслеживания
*/
const date = new Date();
const nowHour = date.getHours();
if (nowHour <= timeStart || nowHour > timeEnd) {
	return;	
}

/*
* Синхронный таймаут
*/
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function fetchLetters(url) {
    const browser = await puppeteer.launch({ 
        headless: true, // false: enables one to view the Chrome instance in action
        defaultViewport: null, // (optional) useful only in non-headless mode
        args: ['--no-sandbox'],
    });
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: 'networkidle2' });
    
    await page.waitFor('input[name="UN"]');
    console.log('Есть форма входа. Можно вводить данные');

    //вводим логин и пароль
    await page.focus('input[name="UN"]');
    await sleep(200);
    await page.keyboard.type(login)
	console.log('Заполнили логин');
    await sleep(500);
    
    await page.focus('input[name="PW"]');
    await sleep(200);
    await page.keyboard.type(pass)
    console.log('Заполнили пароль');
    await sleep(500);
    
    await page.click('.button-login', {options: {delay: 200}});
   	console.log('Нажали на Вход');
	await sleep(2500);

   	if (await page.$('form[name="Proceed"]') !== null) {
   		console.log('Выбросило окно с подтверждением ip адреса');	
   		await page.click('button[title="Продолжить"]');
		await sleep(2500);
   	} else {
   		console.log('Нет окна подтверждения ip, продолжаем процесс загрузки');
   	}

	console.log('Нажимаем на конвертик, для открытия почты');	
	const newPagePromise = new Promise(x => page.once('popup', x));
	await page.click('.icon-envelope', {options: {delay: 200}});
	await sleep(2500);

	console.log('Открылось окно с сообщениями. Забираем его адрес и закрываем');
	const newPage = await newPagePromise;
	const urlMessages = newPage.url();
	await newPage.close();
	console.log(urlMessages);

	console.log('Переходим по данному адресу');
	await page.goto(urlMessages, { waitUntil: 'networkidle2' });
	await sleep(1500);
	console.log('Загружена страница с сообщениями');

	const letters = await page.evaluate(() => {
		let results = [];
		for (let elem of document.querySelectorAll('.jtable tr')) {
			let id = elem.getAttribute('data-record-key');
			let link = elem.querySelector('td:nth-child(3) a');
			if (link) {
				let letter = {
					'id': id,
					'author': link.innerHTML,
					'subject': elem.querySelector('td:nth-child(4)').innerText,
					'date': elem.querySelector('td:nth-child(5)').innerText,
				};
				results.push(letter);
			}
			
		}
		return {
			results: results;
		};
	});
	console.log(letters);

	/*
	* Отправляем данные на webhook
	*/
	(async () => {
		var optionsEvent = {
		    method: 'POST',
		    uri: api,
		    headers: {
		        'User-Agent': 'Request-Promise'
		    },
		    body: letters,
		    json: true
		};
		await requestPromise(optionsEvent).then(function (res) {
	        console.log('Result', res);
	    })
	    .catch(function (err) {
	        console.log('API call failed...');
	    });
	})();

	browser.close();
}

fetchLetters(url);
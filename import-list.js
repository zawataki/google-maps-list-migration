'use strict';

const log4js = require('log4js');
const logger = log4js.getLogger();
log4js.configure({
  appenders: {
    err: {type: 'stderr'}
  },
  categories: {
    default: {appenders: ['err'], level: 'ERROR'}
  }
});

logger.level = 'info';

const mapTypeToListName = {
  'favorite': 'お気に入り',
  'want-to-go': '行ってみたい',
  'travel-plans': '旅行プラン',
  'starred-places': 'スター付き',
  'custom': '',
};

const yargs = require('yargs');
const argv = yargs
  .usage(`Usage: node $0 CSV_FILE <options>

  Imports Google Maps saved list located CSV_FILE`)
  .option('email', {
    description: 'Email address of Google account to import to.',
    type: 'string',
    demandOption: true,
  })
  .option('pass', {
    description: 'Password of Google account to import to.',
    type: 'string',
    demandOption: true,
  })
  .option('type', {
    description: 'Type of list to import to.',
    default: 'favorite',
    choices: Object.keys(mapTypeToListName)
  })
  .option('from', {
    description: 'Handle records starting from a requested number of records. The count is 1-based.',
    type: 'number',
    default: 2,
  })
  .option('to', {
    description: 'Handle records until a requested number of records. The count is 1-based.',
    type: 'number',
  })
  .option('list-name', {
    description: 'List name to import to. Please specify together with "--type custom".',
    type: 'string',
  })
  .option('verbose', {
    alias: 'v',
    description: 'Show debug log.',
    type: 'boolean',
  })
  .epilog(`Examples:
  The command:

    node $0 file1.csv --email example@gmail.com --pass password

  will import places contained in file1.csv to "お気に入り" list of example@gmail.com.

  The command:

    node $0 file1.csv --email example@gmail.com --pass password --type want-to-go

  will import places contained in file1.csv to "行ってみたい" list of example@gmail.com.

  The command:

    node $0 file1.csv --email example@gmail.com --pass password --from 3 --to 4

  will import places located on the 3rd line and the 4th line in file1.csv to "お気に入り" list of example@gmail.com.

  The command:

    node $0 file1.csv --email example@gmail.com --pass password --from 3

  will import places located from the 3rd line to the last line in file1.csv to "お気に入り" list of example@gmail.com.

  The command:

    node $0 file1.csv --email example@gmail.com --pass password --type custom --list-name リスト1

  will import places contained in file1.csv to a list named "リスト1" of example@gmail.com.`)
  .help()
  .alias('help', 'h')
  .version(false)
  .locale('en')
  .check((argv) => {
    if (argv._.length != 1) {
      throw new Error("[ERROR] Please specify CSV_FILE");
    }

    argv.inputFilePath = argv._[0];

    if (!argv.email) {
      throw new Error("[ERROR] --email option requires a non-empty string");
    }

    if (!argv.pass) {
      throw new Error("[ERROR] --pass option requires a non-empty string");
    }

    if (!argv.from || argv.from < 1) {
      throw new Error("[ERROR] --from option requires a number 1 or more");
    }

    if ('to' in argv && (isNaN(argv.to) || argv.to < 1)) {
      throw new Error("[ERROR] --to option requires a number 1 or more");
    }

    if (argv.type === 'custom' && !argv['list-name']) {
      throw new Error("[ERROR] Please specify \"--list-name NAME\" option when --type is \"custom\"");
    }

    if (argv['list-name'] && argv.type !== 'custom') {
      throw new Error("[ERROR] --list-name option is not needed when --type is not \"custom\"");
    }

    if (argv['list-name'].length > 40) {
      throw new Error("[ERROR] --list-name option requires a string up to 40 characters");
    }

    return true;
  })
  .strictOptions()
  .wrap(90)
  .argv;

if (argv.verbose) {
  logger.level = 'debug';
}

if (argv.type === 'custom' && argv['list-name']) {
  mapTypeToListName.custom = argv['list-name'];
}

const parseCsv = async () => {
  const fs = require('fs');
  const {parse} = require('csv-parse/sync');

  const inputBuffer = fs.readFileSync(argv.inputFilePath);
  const options = {
    columns: ['title', 'memo', 'URL', ''],
    from: argv.from,
  };
  if (argv.to) {
    options.to = argv.to;
  }
  const records = parse(inputBuffer, options);

  logger.debug('Parsed records:', records);

  return records;
};


const signInToGoogle = async (page) => {
  const cookies = await page.cookies();
  const alreadySignedIn = cookies.some(c => c.name === 'SID');
  if (alreadySignedIn) {
    return;
  }

  logger.debug('Sign in to Google');

  let loginElement = await page.waitForXPath('//a[text()="ログイン"]');
  await loginElement.click();

  // Reference: https://marian-caikovski.medium.com/automatically-sign-in-with-google-using-puppeteer-cc2cc656da1c
  await page.waitForSelector('input[type="email"]')
  await page.type('input[type="email"]', argv.email);
  await Promise.all([
    page.waitForNavigation(),
    await page.keyboard.press('Enter')
  ]);
  await page.waitForSelector('input[type="password"]', {visible: true});
  await page.type('input[type="password"]', argv.pass);
  await Promise.all([
    page.waitForNavigation(),
    await page.keyboard.press('Enter')
  ]);

  logger.debug('Wait for 2FA');
  await page.waitForNavigation();
};

const {setTimeout} = require('timers/promises');
let isFirstPlace = true;

const saveToList = async (page, listName) => {
  const alreadySaved = (await page.$x(`//div[text()="「${listName}」に保存しました"]`)).length !== 0;
  if (alreadySaved) {
    return;
  }

  logger.debug('Click save button');
  let saveButtonElement = await page.$('button[data-value^="保存"]');
  await saveButtonElement.click();

  if (argv.type === 'custom') {
    await page.waitForSelector('ul[aria-label="リストに保存"]');

    let customListAlreadyExists = (await page.$x(`//div[text()="${listName}"]`)).length !== 0;
    if (!customListAlreadyExists) {
      if (isFirstPlace) {
        logger.info(`Create a new list named ${listName}`);
        let newListCreationElement = (await page.$x('//div[text()="新しいリスト"]')).pop();
        await newListCreationElement.click();

        await page.waitForSelector('input[aria-label="リスト名"]');
        await page.type('input[aria-label="リスト名"]', listName);

        await (await page.waitForXPath('//button[text()="作成"]')).click();

        logger.debug('Wait until saving finish');
        await page.waitForSelector(`div[aria-label="「${listName}」に保存しました"]`);

        return;
      }
      isFirstPlace = false;

      do {
        const sleepTimeSecond = 3;
        logger.debug(`Wait ${sleepTimeSecond} seconds until the created custom list is shown`);
        await setTimeout(sleepTimeSecond * 1000);
        await page.reload();
        await (await page.$('button[data-value^="保存"]')).click();
        await page.waitForSelector('ul[aria-label="リストに保存"]');

        customListAlreadyExists = (await page.$x(`//div[text()="${listName}"]`)).length !== 0;
      } while (!customListAlreadyExists);

    }
  }

  logger.debug(`Click ${listName} in save menu`);
  await (await page.waitForXPath(`//div[text()="${listName}"]`)).click();

  logger.debug('Wait until saving finish');
  await page.waitForSelector(`div[aria-label="「${listName}」に保存しました"]`);
};


const saveMemo = async (page, listName, title, memo, url) => {
  if (!memo) {
    logger.debug('No memo');
    return;
  }

  if (argv.type === 'starred-places') {
    logger.warn(`${listName} list does not have a memo feature.`
      + ` So this memo will not be saved. Name: "${title}". Memo: "${memo}". URL: "${url}"`);
    return;
  }

  const memoAlreadyExists = await page.$(`button[aria-label="「${listName}」のメモを編集します"]`) !== null;
  if (memoAlreadyExists) {
    logger.error('Memo already exists. Please manually append memo.'
      + ` Name: "${title}". Memo: "${memo}". URL: "${url}"`);
    return;
  }

  logger.debug(`Add memo: "${memo}"`);
  let memoAdditionButton = await page.waitForSelector(`button[aria-label="「${listName}」にメモを追加します"]`);
  await memoAdditionButton.click();

  await page.waitForSelector('textarea[aria-label]');
  await page.type('textarea[aria-label]', memo);

  let completeButton = await page.waitForXPath('//button[text()="完了"]');
  await completeButton.click();
};


const URL = require('url').URL;

const savePlace = async (page, title, url, memo) => {
  logger.info(`Save a place named "${title}"`);
  const TARGET_PAGE_URL = new URL(url);

  logger.debug('Open page: ' + TARGET_PAGE_URL);
  const page_response = await page.goto(TARGET_PAGE_URL, {
    // Wait for font rendering
    waitUntil: 'networkidle0'
  });
  if (!page_response.ok()) {
    throw new Error('Got error response code ' + page_response.status + ' from page. ');
  }

  await signInToGoogle(page);

  logger.debug('Wait for page rendering');
  await page.waitForSelector('button[aria-label*="住所"]', {timeout: 10000});

  const listName = mapTypeToListName[argv.type];
  await saveToList(page, listName);

  await saveMemo(page, listName, title, memo, url);

  logger.debug('Saving finished');
};


const savePlaces = async (places) => {
  const puppeteer = require('puppeteer-extra');
  const StealthPlugin = require('puppeteer-extra-plugin-stealth');
  puppeteer.use(StealthPlugin());

  logger.debug('Launch Puppeteer');
  const browser = await puppeteer.launch({headless: false});

  logger.debug('Open new page');
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({
    'accept-language': 'ja'
  });

  for (const place of places) {
    try {
      await savePlace(page, place.title, place.URL, place.memo);
    } catch (e) {
      logger.error(`Failed to save place. Name: "${place.title}". Memo: "${place.memo}". URL: "${place.URL}"`, e);
    }
  }

  await browser.close();
};


const main = async () => {
  const records = await parseCsv();
  await savePlaces(records);
};


(async () => {
  try {
    await main();
  } catch (e) {
    logger.error('Failed to run script', e);
    process.exit(1);
  }
})();

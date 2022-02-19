'use strict'

const log4js = require('log4js');
const logger = log4js.getLogger();
log4js.configure({
  appenders: {
    err: { type: 'stderr' }
  },
  categories: {
    default: { appenders: ['err'], level: 'ERROR' }
  }
});

logger.level = 'info';

const yargs = require('yargs');
const argv = yargs
  .usage(`Usage: node $0 CSV_FILE <options>

  Imports Google Maps saved list located CSV_FILE`)
  .option('email', {
    description: 'Email address of Google account to import to',
    type: 'string',
    demandOption: true,
  })
  .option('pass', {
    description: 'Password of Google account to import to',
    type: 'string',
    demandOption: true,
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
  .option('verbose', {
    alias: 'v',
    description: 'Show debug log',
    type: 'boolean',
  })
  .example('node $0 "/tmp/example.csv" --email example@gmail.com --pass password', '')
  .help()
  .alias('help', 'h')
  .version(false)
  .locale('en')
  .check((argv, options) => {
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

    return true;
  })
  .strictOptions()
  .wrap(90)
  .argv;

if (argv.verbose) {
  logger.level = 'debug';
}


const parseCsv = async () => {
  const fs = require('fs');
  const { parse } = require('csv-parse/sync');

  const inputBuffer = fs.readFileSync(argv.inputFilePath);
  const options = {
    columns: ['title', 'memo', 'URL', ''],
    from: argv.from,
  };
  if (argv.to) {
    options.to = argv.to;
  }
  const records = parse(inputBuffer, options);

  logger.debug('input', records);

  return records;
};

const URL = require('url').URL;

const savePlaceAsFavorite = async (browser, page, title, url, memo) => {
  logger.info(`Save a place named "${title}"`);
  const TARGET_PAGE_URL = new URL(url);

  logger.debug('Open page: ' + TARGET_PAGE_URL);
  const page_response = await page.goto(TARGET_PAGE_URL, {
    // Wait for font rendering
    waitUntil: 'networkidle0'
  });
  if (!page_response.ok()) {
    logger.error('Got error response code ' + page_response.status + ' from page');
    await browser.close();
    return;
  }

  const cookies = await page.cookies();
  const signedInWithGoogle = cookies.some(c => c.name === 'SID');
  if (!signedInWithGoogle) {
    logger.debug('Sign in with Google');

    let loginElement = await page.waitForXPath('//a[text()="ログイン"]');
    await loginElement.click();

    // Reference: https://marian-caikovski.medium.com/automatically-sign-in-with-google-using-puppeteer-cc2cc656da1c
    await page.waitForSelector('input[type="email"]')
    await page.type('input[type="email"]', argv.email);
    await Promise.all([
      page.waitForNavigation(),
      await page.keyboard.press('Enter')
    ]);
    await page.waitForSelector('input[type="password"]', { visible: true });
    await page.type('input[type="password"]', argv.pass);
    await Promise.all([
      page.waitForNavigation(),
      await page.keyboard.press('Enter')
    ]);

    logger.debug('Wait for 2FA');
    await page.waitForNavigation();
  }

  logger.debug('Wait for page rendering');
  await page.waitForSelector('button[aria-label*="住所"]', { timeout: 10000 });

  const alreadySaved = (await page.$x('//div[text()="「お気に入り」に保存しました"]')).length !== 0;
  if (!alreadySaved) {
    logger.debug('Click save button');
    let saveButtonElement = await page.$('button[data-value="保存"]');
    await saveButtonElement.click();

    logger.debug('Click favorite in save menu');
    let menuItemFavoriteElement = await page.waitForSelector('li[role="menuitemcheckbox"]');
    await menuItemFavoriteElement.click();

    logger.debug('Wait until saving finish');
    await page.waitForSelector('div[aria-label="「お気に入り」に保存しました"]');
  }

  if (memo) {
    const memoExists = await page.$('button[aria-label="「お気に入り」のメモを編集します"]') !== null;

    if (memoExists) {
      logger.error('Memo already exists. Please manually append memo.'
        + ` Name: "${title}". Memo: "${memo}". URL: "${url}"`);
    } else {
      logger.debug(`Add memo: "${memo}"`);
      let memoAdditionButton = await page.waitForSelector('button[aria-label="「お気に入り」にメモを追加します"]');
      await memoAdditionButton.click();

      await page.waitForSelector('textarea[aria-label]');
      await page.type('textarea[aria-label]', memo);

      let completeButton = await page.waitForXPath('//button[text()="完了"]');
      await completeButton.click();
    }
  }

  logger.debug('Saving finished');
};


const savePlacesAsFavorite = async (records) => {
  const puppeteer = require('puppeteer-extra');
  const StealthPlugin = require('puppeteer-extra-plugin-stealth');
  puppeteer.use(StealthPlugin());

  logger.debug('Launch Puppeteer');
  const browser = await puppeteer.launch({ headless: false });

  logger.debug('Open new page');
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({
    'accept-language': 'ja'
  });

  for (const record of records) {
    try {
      await savePlaceAsFavorite(browser, page, record.title, record.URL, record.memo);
    } catch (e) {
      logger.error(`Failed to save place. Name: "${record.title}". Memo: "${record.memo}". URL: "${record.URL}"`, e);
    }
  }

  await browser.close();
};


const main = async () => {
  const records = await parseCsv();
  await savePlacesAsFavorite(records);
};


(async () => {
  try {
    await main();
  } catch (e) {
    logger.error('Failed to run script', e);
    process.exit(1);
  }
})();

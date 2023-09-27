#! /usr/bin/env node

import dotenv from 'dotenv';
import fs from 'fs';
import Yargs from 'yargs/yargs';
import CatalogFetcher from '../src/catalog-fetcher.js';
import Validator from '../src/validator.js';
dotenv.config();

function createCatalogFetcher() {
  validateVariables();
  const apiRoot = process.env.API_URL;
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;

  const catalogFetcher = new CatalogFetcher(apiRoot, clientId, clientSecret);
  return catalogFetcher;
}
function createValidator(directory) {
  const validator = new Validator(createCatalogFetcher(), directory);
  return validator;
}

function validateVariables() {
  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    console.error('API_URL environment variable is not set');
    throw new Error('API_URL environment variable is not set');
  }
  if (!/^https?:\/\/.+\/api$/.test(apiUrl)) {
    console.error('API_URL environment variable is not a valid URL');
    throw new Error('API_URL environment variable is not a valid URL');
  }

  const clientId = process.env.CLIENT_ID;
  if (!clientId) {
    console.error('CLIENT_ID environment variable is not set');
    throw new Error('CLIENT_ID environment variable is not set');
  }

  const clientSecret = process.env.CLIENT_SECRET;
  if (!clientSecret) {
    console.error('CLIENT_SECRET environment variable is not set');
    throw new Error('CLIENT_SECRET environment variable is not set');
  }
  if (!/^[a-f0-9]{32}$/i.test(clientSecret)) {
    console.error(
      'CLIENT_SECRET environment variable is not a valid client secret',
    );
    throw new Error(
      'CLIENT_SECRET environment variable is not a valid client secret',
    );
  }
}

Yargs(process.argv.slice(2))
  .option('directory', {
    alias: 'd',
    type: 'string',
    default: '.',
    describe: 'dirctory to process',
  })

  .option('all', {
    alias: 'a',
    type: 'boolean',
    default: false,
    describe: 'validate all files',
  })
  .option('product-type-attributes', {
    type: 'boolean',
    default: false,
    describe: 'validate all productTypeAttributes file',
  })

  .command({
    command: 'validate',
    desc: 'validate',
    handler: (argv) => {
      if (argv.all) {
        return performActions(['validateAll'], argv);
      }
      if (argv['product-type-attributes']) {
        performActions(['validateAll'], argv);
      }
    },
  })
  .command({
    command: 'validate-config',
    desc: 'initEnv #copies creates an empty .env file',
    handler: (argv) => {
      performActions(['validateproductTypeAttributes'], argv);
    },
  })
  .command({
    command: 'init-env',
    desc: 'initEnv #copies creates an empty .env file',
    handler: () => {
      initEnv();
    },
  })
  .demandCommand()
  .strict()
  .help().argv;

async function performActions(actions, args) {
  var validator = createValidator(args.directory);
  if (actions.indexOf('validateAccountSettings') == -1) {
    actions.unshift('validateAccountSettings');
  }
  for (const action of actions) {
    console.log(`performing action ${action}`);
    await validator[action](args);
    console.log(`completed action ${action}`);
  }
}

function initEnv() {
  const template = `
$API_URL=https://t***.com/api
CLIENT_ID=
CLIENT_SECRET=

`;
  if (fs.existsSync('.env')) {
    console.log('.env file already exists');
    process.exit(1);
  }
  fs.writeFileSync('.env', template);
  console.log('update the .env.yaml file');
}

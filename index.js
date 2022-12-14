import React from 'react';
import { argv, exit, stderr, stdout } from 'node:process';
import { createHash } from 'node:crypto';
import {createReadStream} from 'node:fs';
import chalk from "chalk";
import {renderToString} from "react-dom/server";
import {transformFileAsync} from "@babel/core";
import { stat, writeFile, realpath } from 'node:fs/promises';

const writeLn = (string) => {
  stderr.write(`${string}\n`);
}

if (argv.length !== 4) {
  writeLn(chalk.red(`Missing arguments`))
  writeLn(`Usage: node /path/to/index.js /path/to/component.jsx '{"prop": "data", "as": "json string"}'`);
  exit(1);
}

const getFileHash = (file) => {
  return new Promise(function (resolve, reject) {
    const hash = createHash('sha256');
    const input = createReadStream(file);

    input.on('error', reject);

    input.on('data', function (chunk) {
      hash.update(chunk);
    });

    input.on('close', function () {
      resolve(hash.digest('hex'));
    });
  });
};

const getTranspileComponent = async (file) => {
  const realFilePath = await realpath(file);
  const hash = await getFileHash(realFilePath);
  const fileHash = createHash('sha256');
  fileHash.update(realFilePath);
  const fileHashDigest = fileHash.digest('hex');
  const cache = `./.cache/${fileHashDigest}-${hash}.js`.replaceAll(/\.html|\.jsx/g, '');
  await stat(cache).catch(async () => {
    const output = await transformFileAsync(realFilePath, {
      presets: ["@babel/env", "@babel/react"],
      caller: {
        name: "react-drupal",
        supportsStaticESM: true,
      },
    });
    await writeFile(cache, output.code).catch(e => {
      writeLn(chalk.red('Error writing cache'));
      writeLn(e.message);
    });
  });
  return await import(cache);
}

const main = async() => {
  try {
    const Component = await getTranspileComponent(argv[2]);
    const props = JSON.parse(argv[3]);
    const markup = renderToString(React.createElement(Component.default, props));
    stdout.write(markup);
    exit(0);
  }
  catch (e) {
    writeLn(chalk.red('Exception during rendering'));
    writeLn(e.message);
  }
}

main();

// Copyright 2015-2018 Parity Technologies (UK) Ltd.
// This file is part of Parity.
//
// SPDX-License-Identifier: MIT

const { app } = require('electron');
const debug = require('debug')('electron');
const debugParity = require('debug')('parity');
const fs = require('fs');
const { spawn } = require('child_process');
const { promisify } = require('util');

const { cli, parityArgv } = require('../cli');
const isParityRunning = require('./isParityRunning');
const handleError = require('./handleError');
const { parityPath } = require('./doesParityExist');

const fsChmod = promisify(fs.chmod);
const fsExists = promisify(fs.stat);
const fsUnlink = promisify(fs.unlink);

let parity = null; // Will hold the running parity instance

// These are errors output by parity, which Parity UI ignores (i.e. doesn't
// panic). They happen when an instance of parity is already running, and
// parity-ui tries to launch another one.
const catchableErrors = [
  'is already in use, make sure that another instance of an Ethereum client is not running or change the address using the --ws-port and --ws-interface options.',
  'IO error: While lock file:'
];

module.exports = {
  async runParity (mainWindow) {
    try {
      // Do not run parity with --no-run-parity
      if (cli.runParity === false) {
        return;
      }

      // Do not run parity if there is already another instance running
      const isRunning = await isParityRunning();
      if (isRunning) {
        debug(
          `Another instance of parity is already running with pid ${isRunning.pid}, skip running local instance.`
        );
        return;
      }

      // Do not run parity if parityPath has not been calculated. Shouldn't
      // happen as we always run runParity after doesParityExist resolves.
      if (!parityPath) {
        throw new Error('Attempting to run Parity before parityPath is set.');
      }

      // Some users somehow had no +x on the parity binary after downloading
      // it. We try to set it here (no guarantee it will work, we might not
      // have rights to do it).
      try {
        await fsChmod(parityPath(), '755');
      } catch (e) {}

      // Create a logStream to save logs
      const logFile = `${app.getPath('userData')}/parity.log`;

      const logFileExists = await fsExists(logFile);
      if (logFileExists) {
        try {
          await fsUnlink(logFile);
        } catch (e) {} // Do nothing if fsUnlink returns error, just in case
      }

      // Create variables to hold logs
      const logStream = fs.createWriteStream(logFile, { flags: 'a' });
      let logLastLine; // Always contains last line of the logFile

      // Run an instance of parity with the correct args
      parity = spawn(parityPath(), parityArgv);
      debug(
        `Running command "${parityPath().replace(' ', '\\ ')} ${parityArgv.join(
          ' '
        )}".`
      );

      // Pipe all parity command output into the logFile
      parity.stdout.pipe(logStream);
      parity.stderr.pipe(logStream);

      // Save in memory the last line of the log file, for handling error
      const callback = data => {
        if (data && data.length) {
          logLastLine = data.toString();
        }
        debugParity(data.toString());
      };
      parity.stdout.on('data', callback);
      parity.stderr.on('data', callback);

      parity.on('error', err => {
        handleError(err, 'An error occured while running parity.');
      });
      parity.on('close', (exitCode, signal) => {
        if (exitCode === 0) {
          return;
        }

        // When there's already an instance of parity running, then the log
        // is logging a particular line, see below. In this case, we just
        // silently ignore our local instance, and let the 1st parity
        // instance be the main one.
        if (catchableErrors.some(error => logLastLine.includes(error))) {
          debug(
            'Another instance of parity is running, closing local instance.'
          );
          return;
        }

        // If the exit code is not 0, then we show some error message
        if (Object.keys(parityArgv).length > 0) {
          app.exit(1);
        } else {
          handleError(
            new Error(`Exit code ${exitCode}, with signal ${signal}.`),
            'An error occured while running parity.'
          );
        }
      });

      // Notify the renderers
      mainWindow.webContents.send('parity-running', true);
      global.isParityRunning = true; // Send this variable to renderes via IPC

      return Promise.resolve();
    } catch (err) {
      handleError(err, 'An error occured while running parity.');
    }
  },
  killParity () {
    if (parity) {
      debug('Stopping parity.');
      parity.kill();
      parity = null;
    }
  }
};

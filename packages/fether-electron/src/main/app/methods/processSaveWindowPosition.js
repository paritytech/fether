// Copyright 2015-2018 Parity Technologies (UK) Ltd.
// This file is part of Parity.
//
// SPDX-License-Identifier: BSD-3-Clause

import {
  getChangedScreenResolution,
  shouldFixWindowPosition
} from '../utils/window';
import { saveWindowPosition } from '../settings';

function processSaveWindowPosition () {
  if (!this.fetherApp.window) {
    return;
  }

  const { previousScreenResolution } = this.fetherApp;
  const currentScreenResolution = this.getScreenResolution();

  this.fetherApp.previousScreenResolution = getChangedScreenResolution(
    previousScreenResolution,
    currentScreenResolution
  );

  // Get the latest position. The window may have been moved to a different
  // screen with smaller resolution. We must move it to prevent cropping.
  const position = this.fetherApp.window.getPosition();

  const positionStruct = {
    x: position[0],
    y: position[1]
  };

  const fixedWindowPosition = this.fixWindowPosition(positionStruct);

  const newFixedPosition = {
    x: fixedWindowPosition.x || positionStruct.x,
    y: fixedWindowPosition.y || positionStruct.y
  };

  /**
   * Only move it immediately back into the threshold of screen tray bounds
   * if the screen resolution reduced to prevent it from being cropped.
   * Do not call this all the time otherwise it will crash with
   * a call stack exceeded if the user keeps trying to move it outside the screen bounds
   * and it would also prevent the user from moving it to a different screen at all.
   */
  if (
    shouldFixWindowPosition(previousScreenResolution, currentScreenResolution)
  ) {
    // Move window to the fixed x-coordinate position if that required fixing
    if (fixedWindowPosition.x) {
      this.fetherApp.window.setPosition(
        fixedWindowPosition.x,
        positionStruct.y,
        true
      );
    }

    // Move window to the fixed y-coordinate position if that required fixing
    if (fixedWindowPosition.y) {
      this.fetherApp.window.setPosition(
        positionStruct.x,
        fixedWindowPosition.y,
        true
      );
    }
  }

  saveWindowPosition(newFixedPosition || positionStruct);

  this.fetherApp.emit('after-moved-window-position-saved');
}

export default processSaveWindowPosition;
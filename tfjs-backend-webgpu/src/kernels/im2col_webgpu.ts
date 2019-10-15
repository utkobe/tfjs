/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */

import {backend_util, util} from '@tensorflow/tfjs-core';
// import {getCoordsDataType} from '../shader_preprocessor';
import {computeDispatch, flatDispatchLayout} from '../webgpu_util';

import {WebGPUProgram} from './webgpu_program';

export class Im2ColProgram implements WebGPUProgram {
  variableNames = ['A'];
  outputShape: number[];
  userCode: string;
  dispatchLayout: {x: number[]};
  dispatch: [number, number, number];
  rank: number;
  workPerThread = 1;
  workGroupSize: [number, number, number] = [1, 1, 1];

  constructor(
      outputShape: number[], inputShape: number[],
      convInfo: backend_util.Conv2DInfo) {
    this.outputShape = outputShape;
    this.rank = outputShape.length;
    const size = util.sizeFromShape(this.outputShape);

    this.dispatchLayout = flatDispatchLayout(this.outputShape);
    this.dispatch = computeDispatch(
        this.dispatchLayout, this.outputShape, this.workGroupSize,
        [this.workPerThread, 1, 1]);

    const {
      filterWidth,
      inChannels,
      strideWidth,
      strideHeight,
      padInfo,
      outWidth,
      dilationWidth,
      dilationHeight
    } = convInfo;
    const {left, top} = padInfo;
    const itemsPerBlockRow = inChannels * filterWidth;

    this.userCode = `
      void main() {
        ivec2 rc = getOutputCoords();

        int flatIndex = int(gl_GlobalInvocationID.x);

        if(flatIndex < ${size}) {
          int blockIndex = rc[1];
          int pos = rc[0];

          int offsetY = int(blockIndex / ${outWidth}) * ${strideHeight} -
            ${top};
          int d0 = offsetY + ${dilationHeight} * (pos / ${itemsPerBlockRow});
          int offsetX = int(mod(float(blockIndex), ${outWidth}.) *
            ${strideWidth}. - ${left}.);
          int d1 = offsetX + ${dilationWidth} * (int(mod(float(pos),
            ${itemsPerBlockRow}.) / ${inChannels}.));
          int ch = int(mod(float(pos), ${inChannels}.));
          float value = getA(d0, d1, ch);
          setOutput(flatIndex, value);
        }
      }
    `;
  }
}
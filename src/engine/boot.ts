// Engine selection: WebGPU when the browser supports it, WebGL 2 otherwise (or with ?webgl).
import { Engine } from '@babylonjs/core/Engines/engine';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';

export interface BootResult { engine: AbstractEngine; backend: 'webgpu' | 'webgl2'; }

export async function bootEngine(canvas: HTMLCanvasElement): Promise<BootResult> {
  const params = new URLSearchParams(location.search);
  const forceGL = params.has('webgl');
  if (!forceGL) {
    try {
      if (await WebGPUEngine.IsSupportedAsync) {
        const engine = new WebGPUEngine(canvas, { antialias: true, stencil: true, adaptToDeviceRatio: false, powerPreference: 'high-performance' });
        await engine.initAsync();
        return { engine, backend: 'webgpu' };
      }
    } catch (err) { console.warn('WebGPU boot failed, using WebGL 2', err); }
  }
  const engine = new Engine(canvas, true, { stencil: true, powerPreference: 'high-performance', preserveDrawingBuffer: false, doNotHandleContextLost: true });
  return { engine, backend: 'webgl2' };
}

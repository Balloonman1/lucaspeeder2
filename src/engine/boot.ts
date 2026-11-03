// Engine selection: WebGPU when the browser supports it, WebGL 2 otherwise (or with ?webgl).
import { Engine } from '@babylonjs/core/Engines/engine';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';

export interface BootResult { engine: AbstractEngine; backend: 'webgpu' | 'webgl2'; }

export async function bootEngine(canvas: HTMLCanvasElement): Promise<BootResult> {
  const params = new URLSearchParams(location.search);
  // WebGPU is opt-in (?webgpu) until the custom terrain/vegetation shaders are ported to WGSL: on WebGPU
  // Babylon compiles their GLSL through glslang/twgsl fetched from cdn.babylonjs.com, which is slow or
  // blocked on some networks and left the loader stuck at "Compiling shaders".
  const wantGPU = params.has('webgpu') && !params.has('webgl');
  if (wantGPU) {
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

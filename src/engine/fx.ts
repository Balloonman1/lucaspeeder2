// Particle effects: hover wash dust, bursts, sparks, landing rings.
import { Scene, ParticleSystem, Texture, Vector3, Color4, TransformNode, Mesh } from '@babylonjs/core';
import { puffTexture, sparkTexture } from './textures';
import type { Quality } from './quality';

export class FX {
  puff: Texture; spark: Texture; private q: Quality; private scene: Scene;
  private bursts: ParticleSystem[] = []; private sparks: ParticleSystem[] = [];
  constructor(scene: Scene, q: Quality) { this.scene = scene; this.q = q; this.puff = puffTexture(scene); this.spark = sparkTexture(scene); }

  /** dust kicked up under a hover thruster; emitter follows a node */
  washEmitter(node: TransformNode, offset: Vector3): ParticleSystem {
    const ps = new ParticleSystem('wash', Math.round(this.q.particles * 0.4), this.scene);
    ps.particleTexture = this.puff; ps.emitter = node as any; ps.minEmitBox = offset.add(new Vector3(-0.3, 0, -0.3)); ps.maxEmitBox = offset.add(new Vector3(0.3, 0.1, 0.3));
    ps.color1 = new Color4(0.78, 0.66, 0.5, 0.35); ps.color2 = new Color4(0.7, 0.58, 0.44, 0.25); ps.colorDead = new Color4(0.7, 0.6, 0.45, 0);
    ps.minSize = 0.9; ps.maxSize = 1.8; ps.minLifeTime = 0.6; ps.maxLifeTime = 1.4; ps.emitRate = 0; ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.gravity = new Vector3(0, 0.6, 0); ps.direction1 = new Vector3(-1.5, 0.4, -2.5); ps.direction2 = new Vector3(1.5, 1.2, -4); ps.minEmitPower = 0.8; ps.maxEmitPower = 2.2; ps.updateSpeed = 0.012;
    ps.minAngularSpeed = -0.6; ps.maxAngularSpeed = 0.6; ps.minInitialRotation = 0; ps.maxInitialRotation = 6.28;
    ps.addSizeGradient(0, 0.4); ps.addSizeGradient(1, 1.6);
    ps.start(); return ps;
  }
  burst(pos: Vector3, color: Color4, count = 40, speed = 4): void {
    const ps = new ParticleSystem('burst', count, this.scene); ps.particleTexture = this.puff; ps.emitter = pos.clone(); ps.minEmitBox = new Vector3(-0.2, 0, -0.2); ps.maxEmitBox = new Vector3(0.2, 0.4, 0.2);
    ps.color1 = color; ps.color2 = color; ps.colorDead = new Color4(color.r, color.g, color.b, 0); ps.minSize = 0.35; ps.maxSize = 0.9; ps.minLifeTime = 0.4; ps.maxLifeTime = 0.9; ps.manualEmitCount = count; ps.emitRate = 0;
    ps.gravity = new Vector3(0, -3, 0); ps.direction1 = new Vector3(-1, 0.5, -1); ps.direction2 = new Vector3(1, 2, 1); ps.minEmitPower = speed * 0.5; ps.maxEmitPower = speed; ps.updateSpeed = 0.012; ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.targetStopDuration = 0.1; ps.disposeOnStop = true; ps.start();
  }
  sparksAt(pos: Vector3, count = 60): void {
    const ps = new ParticleSystem('sparks', count, this.scene); ps.particleTexture = this.spark; ps.emitter = pos.clone(); ps.minEmitBox = new Vector3(-0.2, 0, -0.2); ps.maxEmitBox = new Vector3(0.2, 0.3, 0.2);
    ps.color1 = new Color4(1, 0.8, 0.4, 1); ps.color2 = new Color4(1, 0.5, 0.15, 1); ps.colorDead = new Color4(0.6, 0.1, 0, 0); ps.minSize = 0.06; ps.maxSize = 0.16; ps.minLifeTime = 0.25; ps.maxLifeTime = 0.7; ps.manualEmitCount = count; ps.emitRate = 0;
    ps.gravity = new Vector3(0, -14, 0); ps.direction1 = new Vector3(-3, 1, -3); ps.direction2 = new Vector3(3, 5, 3); ps.minEmitPower = 3; ps.maxEmitPower = 8; ps.updateSpeed = 0.01; ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.targetStopDuration = 0.1; ps.disposeOnStop = true; ps.start();
  }
  dustRing(pos: Vector3, strength = 1): void {
    const ps = new ParticleSystem('ring', 40, this.scene); ps.particleTexture = this.puff; ps.emitter = pos.clone(); ps.minEmitBox = new Vector3(-0.6, 0, -0.6); ps.maxEmitBox = new Vector3(0.6, 0.2, 0.6);
    ps.color1 = new Color4(0.8, 0.68, 0.5, 0.5); ps.color2 = new Color4(0.75, 0.62, 0.45, 0.4); ps.colorDead = new Color4(0.7, 0.6, 0.45, 0); ps.minSize = 1.2 * strength; ps.maxSize = 2.6 * strength; ps.minLifeTime = 0.6; ps.maxLifeTime = 1.2; ps.manualEmitCount = 40; ps.emitRate = 0;
    ps.gravity = new Vector3(0, 0.3, 0); ps.direction1 = new Vector3(-1, 0.1, -1); ps.direction2 = new Vector3(1, 0.4, 1); ps.minEmitPower = 2 * strength; ps.maxEmitPower = 5 * strength; ps.updateSpeed = 0.012; ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.addSizeGradient(0, 0.5); ps.addSizeGradient(1, 2.2); ps.targetStopDuration = 0.1; ps.disposeOnStop = true; ps.start();
  }
}

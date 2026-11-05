import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene.ts'
import { MenuScene } from './scenes/MenuScene.ts'
import { GameScene } from './scenes/GameScene.ts'
import { FONT } from './ui.ts'

// Wait for the pixel font so Phaser doesn't rasterise text with a fallback.
const fontReady = document.fonts.load(`16px ${FONT}`).catch(() => {})

fontReady.then(() => {
    const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: 1280,
    height: 720,
    backgroundColor: '#1d2b1f',
    pixelArt: true,
    roundPixels: true,
    dom: { createContainer: true },
    // Fixed logical resolution, scaled to fit any window while keeping aspect ratio.
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [BootScene, MenuScene, GameScene],
    })
    // Handy for debugging from the console / automated browser tests.
    if (import.meta.env.DEV) Object.assign(window, { game })
})

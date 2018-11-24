import 'phaser'
import {TestScene, LoginScene} from './sceneTest'
import './classes'
import './client'

export var config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    title: "My Game Title 123",
    version: '0.01',
    autoResize: true,
    autoFocus: false,
    pixelArt: false,
    roundPixels: false, //this isnt working. camera.roundPixels still ends up being true. so we set it to false in the scene Create()
    parent: 'phaser', //* the id of the html element that the phaser canvas will attach itself to. an element with this id must exist in the html file
    antialias: true,
    resolution: 1,
    //zoom: 1, //does not do anything when i change it
    disableContextMenu: true,    
    physics: {
        default: 'matter',
        matter: {
            debug: false,
            enableSleeping: true, //having this on is a massive performance boost, we tested it
            gravity: {y: 0},
        },
    },
    scene: [LoginScene, TestScene],
}

export class Game extends Phaser.Game{
    constructor(conf){
        super(conf)
    }
}

export const game = new Game(config)
export const startTime = Date.now()

setTimeout(function(){
    //these are supposed to stop the game from pausing when tabs switch but it does nothing
    //game.events.off('hidden', game.onHidden, game)
    //game.events.off('visible', game.onVisible, game)
}, 500)
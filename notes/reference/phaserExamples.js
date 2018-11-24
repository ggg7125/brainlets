/*
. that game Exocraft.io knows when you have more than 1 tab of the game open and tells you "you can only play from 1 window/device at a time" we are gonna need that! i think its just IP detection on socket connect

. when you need help check out the Mario example on github it has a lot of useful Phaser 3 es6 code

. these are all valid examples of using import
import Example from 'SomeFolder/Example' //* if that doesnt work try import {Example} from 'etc'
import Enemy from './Enemy'; //* mario example
import 'scriptName' //* import an entire module but it re-runs all the script's global code they said so be careful
var x = import('scriptName')
import * as myModule from 'folder/myModule.js' //* this imports everything the module exports. for example if the module exports a function named  MyFunction you would access it like MyModule.MyFunction()
* the *(star) can also be replaced with a specific module as 'alias' and accessed by the alias
import {Example} from 'SomeFolder/Example' //* this imports Example into the current scope, docs say
import {thing1, thing2} from 'somewhere' //* import multiple things
import {thing1, thing2 as alias} from 'somewhere' //* you can import as alias and mix match like shown
import BootScene from './scenes/BootScene'; //* saw this in the mario github source so its definitely a thing
import 'phaser'; //* this was in the mario github source too

export * from 'src/other_module' //* export everything from some other module with the exports of this module
export var myvar = 5 //* just export some var you just made
export function myfunc() //* export some function you just made!
export class MyClass{} //* yes even this is a thing! export a class you just made
export default Something //* default is for if you want to export just one thing out of that script
export default 5 //* no reason to do this but you could export just the number 5 if you wanted, then access it by alias on import

!caveat: you may have to do <script type="module"> for this to work according to some vague thing i read might have implied? because this tells the browser not to automatically execute the scripts. so script execution order doesnt matter much. index.js or something will import the modules and theyll execute like that.
* "Scripts which use modules must be loaded by setting a type="module" attribute in the <script> tag. For example" says a website. i guess that confirms it!
* "Modules are parsed once, regardless of how many times they’re referenced in the page or other modules." if this means what i think, then we're all good, no double calling the code in them
it says scripts automatically wait for their required imported modules to be fully imported and loaded up before they continue
. my understanding is that you dont have to set the type to "module" it just changes the rules below if you do so. it goes by module rules instead of script rules
differences between module scripts from regular is that top level variables are not global, but local to the script.
and the value of 'this' when used at the top level of the script will be 'undefined' instead of 'window' like usual scripts
. KEEP IN MIND YOU COULD ALWAYS JUST USE NODE'S module.exports AND require() IF YOU DONT LIKE THIS OTHER WAY!
! BUT YOU CANT MIX THEM. ITS ONE OR THE OTHER ACCORDING TO A THING I READ

. IMPORTANT: I suggest we use modules in a more Unity3D sense where instead of executing things in modules in the global scope, (such as simply typing console.log('hello') at the global scope of the script, and then the script runs it will say 'hello' on its own because the global scope automatically executes any code or anything put in the global scope) so instead we put a Start() function in modules that are meant to execute game logic and the Start() function will set off everything needed to do that, it doesnt start executing game logic in global scope because think about how bad that would be
*/

//. you can use node stuff in clientside scripts, such as require(), because webpack will fix it up to use in a browser

/*
? game.physics.startSystem(Phaser.Physics.ARCADE)
? game.physics.arcade.enable(sprite) //physics must be enabled on each sprite created like this
? this.stage.disableVisibilityChange = true //supposedly makes it so the window does not go to sleep when it no longer has focus
? this.physics.startSystem(Phaser.Physics.P2JS); //saw this somewhere, p2 physics
? this.physics.p2.setBoundsToWorld(false, false, false, false, false) //a function we should probably learn about
? game.world.setBounds(-1000, -1000, 2000, 2000);

? this.state.add('GameTitle', GameTitle, false)
? this.state.start('GameTitle')
? this.state.restart()
*/

//. IMPORTANT. script execution order is aggravating but after reading a lot about it i think just bypass the execution order entirely by doing what unity does and give ourselves an Awake and Start function as shown here. for modules if you dont want global code to run on import you should do this anyway and import it then start it with module.Start()
setTimeout(Start, 100)
function Start(){

}
//. wont script load order not be important if i use one of those tools to combine them all into 1 script? maybe we should try that out

var cursors //this is the arrow keys idk why phaser calls it this

var game = new Phaser.Game(config)
game.world.bringToTop(group)
var player

const phaser = require('phaser')
import 'phaser' //saw this in that es6 mario template
const scenes = require('./scenes')

class Game extends Phaser.Game{
    constructor(){
        console.log('run this to see if this message appears even when we dont create an instance of this class')
        super(config)
    }
}

module.exports = Game //somehow this is supposed to help me use it in other scripts
export default Game //this is some es6 version. //. exporting is what makes it available to import everywhere else!

var mygame = new Game()

//just remember we can add functions to classes like this in other scripts than where the class is
Game.prototype.MyFunction = function(){

}

class BootScene extends Phaser.Scene{
    constructor(){
        super({key: 'BootScene'})
    }

    //alternative example
    constructor(){
        this.scene_config = {
            key: 'main',
            active: true, //idk i just saw it somewhere
            preload: preload,
            create: create,
            update: update,
        }
        super(this.scene_config)
    }

    preload(){
        const progress = this.add.graphics()
        
        //. see package.json where we have included phaser-animated-tiles. this has something to do with that. its all from the MARIO example on github
        this.load.scenePlugin('animatedTiles', AnimatedTiles, 'animatedTiles', 'animatedTiles')

        this.load.on('progress', function(value){
            progress.clear()
        })
        this.load.on('complete', function(){
            progress.destroy()
            this.scene.start('TitleScene')
        })
        this.load.image(etc)
        this.load.tilemapTiledJSON('map', 'assets/tilemaps/mario.json')
        this.load.spritesheet(etc)
        this.load.atlas(etc)
        this.load.audio(etc)
        this.load.bitmapFont(etc)
        this.load.json(etc)
        this.scene.bringToTop()

        this.registry.set('restartScene', false) //nice
        if (this.registry.get('restartScene')) {
            this.restartScene();
        }

        let el = document.getElementsByTagName('canvas')[0];
        el.style.width = 400 * multiplier + 'px';
        el.style.height = 240 * multiplier + 'px';

        this.input.on('pointerdown', function (pointer) {
            this.startGame();
        }, this);

        this.scene.stop('GameScene')
        this.scene.start('GameScene')
        this.scene.launch('GameScene')

        scene.anims.create(config)
    }

    create(){
        if(this.registry.get('attractMode'))
        this.rooms = []
        this.map = this.make.tilemap({
            key: 'map',
        })
        this.tileset = this.map.addTilesetImage('SuperMarioBros-World1-1', 'tiles')
        // "Dynamic layer because we want breakable and animated tiles" <- comment from mario example
        this.groundLayer = this.map.createDynamicLayer('world', this.tileset, 0, 0)
        this.sys.animatedTiles.init(this.map)
        this.keys = {
            jump: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
            jump2: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X),
            fire: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z),
            left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
            right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
            down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN)
        }

    }

    update(time, dt){

    }
}

//. lots of docs are recommending you extend just about every phaser class
//. it looks like this is now Phaser.GameObjects.Sprite? thats what i saw when they extend it in the phaser 3 mario example
class MySprite extends Phaser.GameObjects.Sprite{
    constructor(config){
        super(config.scene, config.x, config.y, config.key)
        this.scene.spriteCount++ //this would be a custom var we put on the scene class
        this.somevar = config.somecustomvar
        config.scene.physics.world.enable(this) //idk which of these to use i saw both in different places
        this.scene.physics.world.enable(this);
        config.scene.add.existing(this) //idk what this does, check into it
        this.body.velocity.x = 100
        this.body.setVelocity(100,100)
        this.body.setSize(32,32)
        this.setDepth(-100)
        this.body.allowGravity = false
        this.body.offset.set(5,5)
        this.x = 200
        this.anims.play('anim')
        this.play('anim') //i saw both so idk why. same scope and context
        this.scene.sound.playAudioSprite('sfx', 'smb_coin')
        this.destroy()
        this.alpha = 0 //0-1
        this.flipX = true
    }

    //saw this in mario source so its definitely a thing
    update(time, dt){
        if(this.body.sliding) this.scene.physics.world.collide(this, this.scene.groundLayer)
        this.scene.physics.world.overlap(this, this.scene.mario, this.collected)
        if(this.body.blocked.down) this.body.velocity.y = -300
    }

    //also saw this on another sprite class in the mario source, the params are different so i think somehow its called manually not automatically by Phaser
    update(keys, time, dt){

    }
}

//saw this in the mario example where all the enemy types inherit from the Enemy class which inherits from Phaser.GameObjects.Sprite
class Enemy extends MySprite{

}

class Wolf extends Enemy{

}

function preload() {
    //? this.load.setBaseURL('http://labs.phaser.io')
    this.load.image('sky', 'assets/sky.jpg')
    this.load.image('player', 'assets/player.png')
    this.load.image('orb', 'assets/orb.png')
}

function create() {
    cursors = this.input.keyboard.createCursorKeys()
    var sky = this.add.sprite(game.config.width/2, game.config.height/2, 'sky')
    player = this.add.sprite(game.config.width/2, game.config.height/2, 'player')
    //? player = this.physics.add.sprite(x, y, 'tag') is a thing too. sounds useful. and use player.setCollideWorldBounds(true)
    //? player.setBounce(0.2), player.setGravityY(0)
    //? player.disableBody(true, true) and player.enableBody(???) idk
    //you could also use game.world.centerX and centerY from an example i saw
    sky.setDisplaySize(game.config.width, game.config.height)
    this.events.on('resize', function(){
        sky.x = game.config.width/2
        sky.y = game.config.height/2
        sky.setDisplaySize(game.config.width, game.config.height)
    })
    //players.push(newPlayer)
}

function update(time, dt) {
    let spd = 4
    if(cursors.up.isDown) player.y -= spd
    if(cursors.down.isDown) player.y += spd
    if(cursors.left.isDown) player.x -= spd
    if(cursors.right.isDown) player.x += spd
    //* for physics sprites, player.setVelocityX(-160) etc for moving
}

var remotePlayer

socket.on('newPlayer', function(){
    console.log('new player spawned from server')
    setTimeout(function(){
        remotePlayer = game.scene.getScene('main').add.sprite(game.config.width/2, game.config.height/2, 'orb')
    }, 1000)
})
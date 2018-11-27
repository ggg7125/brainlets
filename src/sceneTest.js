import 'phaser'
import {MapDecor, WeaponPlatform, WeaponPlatformCheck, Water} from './classes'
import {socket} from './client'
import {game} from './index'
import { SetLastRenderUpdate } from './authority'
import { RefreshCameraZoom, RefreshFullScreenButton, RefreshStatsToggle, RefreshMoneyUI } from './ui';
import { lmb, rmb } from './abilityCore';
import { AddToRadar } from './radar';
var utils = require('../utils')
var clientUtils = require('./clientUtils')

export var player

export function GetPlayer(){
    return player
}

export function SetPlayer(v){
    player = v
    return v
}

var mapSeed = 'jfjrijkgntnr74' //. if we ever want different random maps just have the room they join change this value, but for now, just leave all clients with this default map value, its fine
var playerPositionLastFrame = new Phaser.Math.Vector2()
var keymap = {
    'up': Phaser.Input.Keyboard.KeyCodes.W,
    'down': Phaser.Input.Keyboard.KeyCodes.S,
    'left': Phaser.Input.Keyboard.KeyCodes.A,
    'right': Phaser.Input.Keyboard.KeyCodes.D,
    'enter': Phaser.Input.Keyboard.KeyCodes.ENTER,
    'arrowUp': Phaser.Input.Keyboard.KeyCodes.UP,
    'arrowDown': Phaser.Input.Keyboard.KeyCodes.DOWN,
    'arrowLeft': Phaser.Input.Keyboard.KeyCodes.LEFT,
    'arrowRight': Phaser.Input.Keyboard.KeyCodes.RIGHT,
    'Z': Phaser.Input.Keyboard.KeyCodes.Z,
    'X': Phaser.Input.Keyboard.KeyCodes.X,
    'N': Phaser.Input.Keyboard.KeyCodes.N,
    'M': Phaser.Input.Keyboard.KeyCodes.M,
}
var keys
var cameraThing

export function GetKeys(){
    return keys
}

let titleScreen = null

//. CHECK THAT URL WE FAVORITED YESTERDAY ABOUT RESIZING WITH ALL THE PHASER TIPS AND TRICKS AND STUFF IT SEEMS TO CONTAIN THE ANSWER
window.addEventListener('resize', function(event){
    if(!game || !game.resize || !game.renderer){
        return //window was resized before the game was even really loaded yet, errors will occur if we proceed
    }
    let w = window.innerWidth
    let h = window.innerHeight - 0 //supposedly subtracting 4 gets rid of the 'scrollbar bug' where the scrollbar still appears and the guy doesnt really know why but he says this fixes it and our game DOES have that problem but it only appears sometimes (VERY INCONSISTENT) so thats why we do this
    //* yes its true -4 pixels does get rid of the scrollbar 'bug' but we have no solved it with css by setting the canvas to have display:block instead of the default display:inline
    game.config.width = w //we update the configs just in case it matters, i dont really know, but at least itll be accurate
    game.config.height = h
    game.resize(w, h)
    for(let i in game.scene.scenes) game.scene.scenes[i].cameras.resize(w, h)
    if(titleScreen){
        titleScreen.setPosition(w / 2, h / 2)
        titleScreen.setDisplaySize(w, h) //if the title screen is ever doesnt fit the screen even though with this code it should, its because camera zoom is not on 1. we have been through that before
    }
    RefreshFullScreenButton()
    RefreshStatsToggle()
    RefreshMoneyUI()
    RefreshCameraZoom() //we do this to zoom out with smaller window sizes so that the distance the player can see stays the same. otherwise the sprites would stay one size and you would be zoomed up right onto your character unable to see far at all when you are on a small window. basically we shrink the game when the window shrinks.
    
    game.scene.scenes[1].cameras.main.stopFollow() //? uneccessary? a new startFollow will just overwrite it anyway i think
    if(player) game.scene.scenes[1].cameras.main.startFollow(player, true, 1, 1) //* THIS DOES NOT GO HERE WE ARE JUST TEMPORARILY TESTING IT TO SEE IF IT FIXES THE PROBLEM ON ITCH.IO WHERE UPON GOING FULLSCREEN THE CHARACTER IS IN THE TOP LEFT CORNER
    //. but we do have it here for a reason, see if it needs it or not before removing it
})

/*setInterval(function(){
    let c = game.scene.scenes[1].cameras.main
    console.log(`centerX = ${c.centerX}. centerY = ${c.centerY}. displayWidth = ${c.displayWidth}. displayHeight = ${c.displayHeight}. followOffset.x = ${c.followOffset.x}, followOffset.y = ${c.followOffset.y}. width = ${c.width}. height = ${c.height}.`)
    //console.log(c.config)
}, 1000)*/

export class Scene extends Phaser.Scene{
    constructor(config){
        super(config)
        let self = this
        this.sceneKey = config.key
        this.worldBoundsX = 15000
        this.worldBoundsY = 15000
    }

    CallThisInAllScenesCreateFunctions(){
        return
    }

    LoadingBar(){
        let self = this
        let width = this.cameras.main.width
        let height = this.cameras.main.height
        let progressBar = this.add.graphics()
        let progressBox = this.add.graphics()
        //progressBox.fillStyle(0x222222, 0.8)
        progressBox.fillStyle(0x006FFF, 0.8)
        progressBox.fillRect(width / 2 - 160, height / 2 - 25, 320, 50)

        let loadingText = this.make.text({
            x: width / 2,
            y: height / 2 - 50,
            text: 'Loading...',
            style: {font: '20px monospace', fill: '#ffffff'},
        })
        loadingText.setOrigin(0.5, 0.5)

        let percentText = this.make.text({
            x: width / 2,
            y: height / 2 - 5,
            text: '0%',
            style: {font: '18px monospace', fill: '#ffffff'},
        })
        percentText.setOrigin(0.5, 0.5)

        this.load.on('progress', function(value){
            percentText.setText(parseInt(value * 100) + '%')
            progressBar.clear()
            //progressBar.fillStyle(0xffffff, 1)
            progressBar.fillStyle(0x00CDFF, 1)
            progressBox.fillRect(width / 2 - (150 * value), height / 2 - 15, 300 * value, 30)
        })

        //can use this to display a UI of what file is currently downloading
        this.load.on('fileprogress', function(file){
            //console.log(file.src)
        })

        this.load.on('complete', function(){
            progressBar.destroy()
            progressBox.destroy()
            loadingText.destroy()
            percentText.destroy()

            if(self.sceneKey == 'LoginScene') document.getElementById('titleUI').hidden = false
        })
    }
}

//* this would be a persistant scene that is always running parallel to any other scene loaded. for persistant objects and perhaps UI (idk) but you get the idea its just important to know this is possible (or so ive heard it be hinted at)
export class GlobalScene extends Scene{

}

export class LoginScene extends Scene{
    constructor(){
        super({key: 'LoginScene'})
    }

    init(){

    }

    preload(){
        this.LoadingBar()
        //* always load at least 1 asset after this.LoadingBar() or the bar will be stuck at 0% forever on the screen and in the way
        this.load.image('fightzTitleScreen', 'assets/background.jpg')
        //this.load.audio('titleMusic', 'assets/sfx/titleMusic.mp3')
    }

    create(){
        this.CallThisInAllScenesCreateFunctions()

        //let titleMusic = this.sound.add('titleMusic')
        //titleMusic.play()
        //titleMusic.setLoop(true)
        //titleMusic.setVolume(0.5)

        //. dont delete, it contains screen resizing reference code we need to keep, check it out
        titleScreen = this.add.sprite(this.game.config.width/2, this.game.config.height/2, 'fightzTitleScreen')
        titleScreen.setDisplaySize(this.game.config.width, this.game.config.height)
    }

    shutdown(){
        console.log('shutdown')
    }
}

export var meleeSfx
export var blastSfx
export var shieldBreakSfx
export var electricSfx
export var bowSfx
export var swordSfx

export class TestScene extends Scene{
    constructor(){
        super({key: 'TestScene'})
    }

    //i learned this happens before preload and you can use it to set up scene parameters or something
    init(){
        
    }

    preload(){
        this.LoadingBar()
        //. VERY IMPORTANT. if you ever add a new image that is intended to be used as an overlay or synced over the network at all, add a matching key to the 'SpriteKeyToId' in clientUtils or it can not be synced! it will be invisible to everyone else.
        this.load.image('player', 'assets/circleWithEyes.png')
        this.load.image('spawnPlatform', 'assets/platforms/spawnPlatform.png')
        this.load.image('blueCrystal', 'assets/blueCrystal128.png')
        this.load.image('treasureBag', 'assets/treasureBag.png')
        this.load.image('powerGem', 'assets/powerGem.png')
        this.load.image('yellowRadialCircle', 'assets/yellowRadialCircle.png')
        
        this.load.image('blueRadarDot', 'assets/radarDots/radarDotBlue.png')
        this.load.image('redRadarDot', 'assets/radarDots/radarDotRed.png')
        this.load.image('radarDotGreen', 'assets/radarDots/radarDotGreen.png')
        this.load.image('radarDotPurple', 'assets/radarDots/radarDotPurple.png')
        this.load.image('radarDotYellow', 'assets/radarDots/radarDotYellow.png')

        //map decor
        this.load.image('grass', 'assets/green mosaic.jpg')
        this.load.image('rock', 'assets/decor/myRock.png')
        this.load.image('water', 'assets/decor/myWater.png')
        this.load.image('bush', 'assets/decor/myBush.png')
        this.load.image('tree', 'assets/decor/myTree.png')

        //weapon overlays
        this.load.image('hatchet', 'assets/weapons/hatchet.png')
        this.load.image('staff', 'assets/weapons/staff.png')
        this.load.image('bow', 'assets/weapons/bow.png')
        this.load.image('sword', 'assets/weapons/sword.png')
        
        //npcs
        this.load.image('wolf', 'assets/npcs/wolf.png')
        this.load.image('deer', 'assets/npcs/deer.png')
        this.load.image('boar', 'assets/npcs/boar.png')
        this.load.image('rabbit', 'assets/npcs/rabbit.png')
        this.load.image('chicken', 'assets/npcs/chicken.png')
        this.load.image('lizard', 'assets/npcs/lizard.png')
        this.load.image('zombie', 'assets/npcs/zombie.png')
        this.load.image('rat', 'assets/npcs/rat.png')

        //bullet fx
        this.load.image('melee', 'assets/fx/meleeSlash.png')
        this.load.image('shield', 'assets/fx/energyShield.png')
        this.load.image('blueKiShot', 'assets/fx/blast.png')
        this.load.image('rapidBlast', 'assets/fx/rapidBlast.png')
        this.load.image('arrow', 'assets/fx/arrow.png')
        this.load.image('aoeBullet', 'assets/fx/aoeBullet.png')
        this.load.image('swordBullet', 'assets/fx/swordBullet.png')

        //hat overlays
        this.load.image('mageHat', 'assets/clothes/purpleCloak.png')
        this.load.image('fighterHat', 'assets/clothes/fighterHat.png')
        this.load.image('gokuHair', 'assets/clothes/gokuHair.png')
        this.load.image('killuaHair', 'assets/clothes/killuaHair.png')
        this.load.image('brainletHat', 'assets/clothes/brainletHat.png')

        //weapon platforms
        this.load.image('shieldPlatform', 'assets/platforms/shieldPlatform.png')
        this.load.image('axePlatform', 'assets/platforms/axePlatform.png')
        this.load.image('bowPlatform', 'assets/platforms/bowPlatform.png')
        this.load.image('blastPlatform', 'assets/platforms/blastPlatform.png')
        this.load.image('rapidBlastPlatform', 'assets/platforms/rapidBlastPlatform.png')
        this.load.image('wizardAoEPlatform', 'assets/platforms/wizardAoEPlatform.png')
        this.load.image('swordPlatform', 'assets/platforms/swordPlatform.png')
        this.load.image('brainletPlatform', 'assets/platforms/brainletPlatform.png')

        //hat platforms
        this.load.image('fighterHatPlatform', 'assets/platforms/fighterHatPlatform.png')
        this.load.image('mageHatPlatform', 'assets/platforms/mageHatPlatform.png')
        this.load.image('gokuHairPlatform', 'assets/platforms/gokuHairPlatform.png')
        this.load.image('killuaHairPlatform', 'assets/platforms/killuaHairPlatform.png')

        //sounds
        this.load.audio('meleeSound', 'assets/sfx/melee.mp3')
        this.load.audio('shieldBreak', 'assets/sfx/shieldBreak.mp3')
        this.load.audio('electricSfx', 'assets/sfx/electric.mp3')
        this.load.audio('blastSfx', 'assets/sfx/blast.mp3')
        this.load.audio('bowSfx', 'assets/sfx/bow.mp3')
        this.load.audio('swordSfx', 'assets/sfx/slash.mp3')

        //sprite sheets
        this.load.spritesheet('electricOverlay', 'assets/fx/electricOverlay.png', {frameWidth: 128, frameHeight: 128})
        this.load.spritesheet('explosion', 'assets/fx/explosionSheet.png', {frameWidth: 80, frameHeight: 80})
    }

    create(){
        let self = this
        this.CallThisInAllScenesCreateFunctions()
        this.cameras.main.setRoundPixels(false) //putting this in the 'game' config doesnt work so we do it here

        this.anims.create({
            key: 'electricOverlay',
            frames: this.anims.generateFrameNumbers('electricOverlay', {start: 0, end: 15}),
            frameRate: 20,
            repeat: -1,
        })

        this.anims.create({
            key: 'explosion',
            frames: this.anims.generateFrameNumbers('explosion', {start: 0, end: 4}),
            frameRate: 20,
            repeat: 0,
        })

        meleeSfx = this.sound.add('meleeSound')
        blastSfx = this.sound.add('blastSfx')
        blastSfx.setVolume(0.25)
        shieldBreakSfx = this.sound.add('shieldBreak')
        shieldBreakSfx.setVolume(0.35)
        electricSfx = this.sound.add('electricSfx')
        electricSfx.setLoop(true)
        bowSfx = this.sound.add('bowSfx')
        swordSfx = this.sound.add('swordSfx')
        
        //console.log(this.sound)

        //this.input.setDefaultCursor('url(assets/ui/reticle.cur), pointer') //. we now are using the CSS file to set our cursor

        setInterval(function(){
            //console.log(Phaser.Physics.Matter.Matter)
            //console.log(self.matter)
        }, 1000)

        Phaser.Physics.Matter.Matter.Events.on(self.matter.world.engine, 'collisionStart', function(matterevent){
            //an array of every set of 2 bodies which are colliding with each other at this time
            for(let i in matterevent.pairs){
                let data = matterevent.pairs[i]
                let body1 = data.bodyA
                let body2 = data.bodyB
                if(body1 && body1.gameObject) for(let i in body1.gameObject.collisionDelegates){
                    let f = body1.gameObject.collisionDelegates[i]
                    if(f) f(body2)
                }
                if(body2 && body2.gameObject) for(let i in body2.gameObject.collisionDelegates){
                    let f = body2.gameObject.collisionDelegates[i]
                    if(f) f(body1)
                }
                //. without this, RemotePlayers will not be able to push rocks!
                //* explanation: for certain situations we move using SetPosition instead of SetVelocity, for example RemotePlayer moves with SetPosition. problem is, the physics engine wont wake up objects you bump into using SetPosition, it doesnt consider those a 'real' collision since you didnt do it using physics. meaning you can not push the rock because it is Sleeping and cant be moved. so instead we wake it up here.
                clientUtils.SetSleeping(body1.gameObject, false)
                clientUtils.SetSleeping(body2.gameObject, false)
            }
        })

        Phaser.Physics.Matter.Matter.Events.on(self.matter.world.engine, 'collisionActive', function(matterevent){
            //an array of every set of 2 bodies which are colliding with each other at this time
            for(let i in matterevent.pairs){
                let data = matterevent.pairs[i]
                let body1 = data.bodyA
                let body2 = data.bodyB
                if(body1 && body1.gameObject) for(let i in body1.gameObject.collisionStayDelegates){
                    let f = body1.gameObject.collisionStayDelegates[i]
                    if(f) f(body2)
                }
                if(body2 && body2.gameObject) for(let i in body2.gameObject.collisionStayDelegates){
                    let f = body2.gameObject.collisionStayDelegates[i]
                    if(f) f(body1)
                }
                //. see explanation above
                clientUtils.SetSleeping(body1.gameObject, false)
                clientUtils.SetSleeping(body2.gameObject, false)
            }
        })

        Phaser.Physics.Matter.Matter.Events.on(self.matter.world.engine, 'collisionEnd', function(matterevent){
            //an array of every set of 2 bodies which are colliding with each other at this time
            for(let i in matterevent.pairs){
                let data = matterevent.pairs[i]
                let body1 = data.bodyA
                let body2 = data.bodyB
                if(body1 && body1.gameObject) for(let i in body1.gameObject.collisionEndDelegates){
                    let f = body1.gameObject.collisionEndDelegates[i]
                    if(f) f(body2)
                }
                if(body2 && body2.gameObject) for(let i in body2.gameObject.collisionEndDelegates){
                    let f = body2.gameObject.collisionEndDelegates[i]
                    if(f) f(body1)
                }
                //. see explanation above
                clientUtils.SetSleeping(body1.gameObject, false)
                clientUtils.SetSleeping(body2.gameObject, false)
            }
        })

        socket.emit('leaveTitleScreen') //so the relay server knows to make this client join a dynamic room now that they have left the title screen
        //* and somewhere down the chain this triggers creating of the localPlayer i think

        this.matter.world.setBounds(0, 0, this.worldBoundsX, this.worldBoundsY)
        this.cameras.main.setBounds(0, 0, this.worldBoundsX, this.worldBoundsY)
        this.input.mouse.disableContextMenu() //. disable right click menu from popping up
        keys = this.input.keyboard.addKeys(keymap)
        
        this.input.on('pointerdown', function(pointer){
            WeaponPlatformCheck(pointer)
        })

        this.input.on('pointerup', function(pointer){
            if(player){
                if(pointer.buttons == 1 && lmb) lmb.StopAbility(player)
                if(pointer.buttons == 2 && rmb) rmb.StopAbility(player)
            }
        })

        this.input.on('pointermove', function(pointer){
            //example
        })

        let grass = this.add.sprite(this.worldBoundsX / 2, this.worldBoundsY / 2, 'grass')
        grass.setDisplaySize(this.worldBoundsX, this.worldBoundsY)

        this.GenerateMapFeatures()

        RefreshCameraZoom()

        this.game.events.on('prerender', function(){
            //RefreshRadar()
        })

        /*var cameraConfig = {
            camera: this.cameras.main,
            left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Left),
            right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Right),
            up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Up),
            down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Down),
            zoomIn: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
            zoomOut: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
            acceleration: 0.06,
            drag: 0.0005,
            maxSpeed: 0.5,
        }
    
        cameraThing = new Phaser.Cameras.Controls.SmoothedKeyControl(cameraConfig)*/
    }

    update(time, dt){
        this.PlayerUpdate(time, dt)
        SetLastRenderUpdate(Date.now()) //we can use lastUpdate var this assigns to to check for inactivity when you switch tabs the tab sleeps so we can use setInterval because that still runs in other tabs but update will not and we check if the last update was too long ago and switch authority to someone else
    }

    //heard tell of these in a phaser 3 tutorial, vaguely mentioned
    render(){
        //console.log('render')
    }

    shutdown(){
        console.log('shutdown')
    }

    destroy(){
        console.log('destroy')
    }

    PlayerUpdate(time, dt){
        if(!player) return
        PlayerInputMove()

        if(cameraThing) cameraThing.update(dt)

        let playerAngle = Phaser.Math.Angle.Between(player.x, player.y, mouseX, mouseY)
        if(!player.stunned) player.setRotation(playerAngle)
        UpdatePointerPosition()

        playerPositionLastFrame.set(player.x, player.y)

        ChatFocusCheck()

        //we are going to try to perform abilities on a loop instead of just the mouse 'on down' event so you can now just hold the button to continuously use it
        if(!chatting){
            if(this.Ability1KeyDown() && lmb) lmb.TryAbility()
            if(this.Ability2KeyDown() && rmb) rmb.TryAbility()
        }
    }

    Ability1KeyDown(){
        let pointer = this.input.activePointer
        if(pointer.buttons == 1 && pointer.isDown) return true
        if(keys.Z.isDown || keys.N.isDown) return true //for people on chromebooks, with the choice for left hand or right hand
        return false
    }

    Ability2KeyDown(){
        let pointer = this.input.activePointer
        if(pointer.buttons == 2 && pointer.isDown) return true
        if(keys.X.isDown || keys.M.isDown) return true //for people on chromebooks, with the choice for left hand or right hand
        return false
    }

    GenerateMapFeatures(){
        this.GenerateWater(0.8) //water needs generated first because trees/bushes/rocks/etc are going to delete themselves if they spawn on water
        this.GenerateTrees(0.8)
        this.GenerateBushes(0.8)
        this.GenerateRocks(0.8)

        this.GenerateSpawnPlatform()
        this.GenerateWeaponPlatforms()
        this.GenerateHatPlatforms()
    }

    GenerateSpawnPlatform(){
        let s = new MapDecor({scene: this, key: 'spawnPlatform'})
        s.setPosition(this.worldBoundsX / 2, this.worldBoundsY / 2)
        s.setDepth(utils.layers().map4)
        s.setScale(2.6)
        s.setStatic(true)
        s.setSensor(true)
        s.canSpawnInWater = true
        AddToRadar(s, 'radarDotPurple', 1)
    }

    GenerateWeaponPlatforms(){
        let p = new WeaponPlatform({scene: this, key: 'shieldPlatform'})
        p.weaponId = utils.msg().abilityShield
        clientUtils.SetPosition(p, 10000, 10000)
        p.setDepth(utils.layers().map5)
        p.setScale(1.7)
        p.setStatic(true)
        AddToRadar(p, 'radarDotGreen', 0.7)

        let p2 = new WeaponPlatform({scene: this, key: 'axePlatform'})
        p2.weaponId = utils.msg().abilityMelee
        clientUtils.SetPosition(p2, 4100, 3700)
        p2.setDepth(utils.layers().map5)
        p2.setScale(1.7)
        p2.setStatic(true)
        AddToRadar(p2, 'radarDotGreen', 0.7)

        let p3 = new WeaponPlatform({scene: this, key: 'blastPlatform'})
        p3.weaponId = utils.msg().abilityBlast
        clientUtils.SetPosition(p3, 6100, 10000)
        p3.setDepth(utils.layers().map5)
        p3.setScale(1.7)
        p3.setStatic(true)
        AddToRadar(p3, 'radarDotGreen', 0.7)

        let p4 = new WeaponPlatform({scene: this, key: 'rapidBlastPlatform'})
        p4.weaponId = utils.msg().abilityRapidBlast
        clientUtils.SetPosition(p4, 11000, 12000)
        p4.setDepth(utils.layers().map5)
        p4.setScale(1.7)
        p4.setStatic(true)
        AddToRadar(p4, 'radarDotGreen', 0.7)

        let p5 = new WeaponPlatform({scene: this, key: 'bowPlatform'})
        p5.weaponId = utils.msg().abilityBow
        clientUtils.SetPosition(p5, 5700, 5800)
        p5.setDepth(utils.layers().map5)
        p5.setScale(1.7)
        p5.setStatic(true)
        AddToRadar(p5, 'radarDotGreen', 0.7)

        let p6 = new WeaponPlatform({scene: this, key: 'wizardAoEPlatform'})
        p6.weaponId = utils.msg().abilityWizardAoE
        clientUtils.SetPosition(p6, 10600, 8300)
        p6.setDepth(utils.layers().map5)
        p6.setScale(1.7)
        p6.setStatic(true)
        AddToRadar(p6, 'radarDotGreen', 0.7)

        let p7 = new WeaponPlatform({scene: this, key: 'swordPlatform'})
        p7.weaponId = utils.msg().abilitySword
        clientUtils.SetPosition(p7, 5100, 4700)
        p7.setDepth(utils.layers().map5)
        p7.setScale(1.7)
        p7.setStatic(true)
        AddToRadar(p7, 'radarDotGreen', 0.7)

        /*setInterval(function(){
            if(player) console.log(`${player.x},${player.y}`)
        }, 1000)*/
    }

    GenerateHatPlatforms(){
        let p = new WeaponPlatform({scene: this, key: 'fighterHatPlatform'})
        p.hatPlatform = true
        p.weaponId = utils.msg().barbarianHat
        clientUtils.SetPosition(p, 9100, 4900)
        p.setDepth(utils.layers().map5)
        p.setScale(1.7)
        p.setStatic(true)
        AddToRadar(p, 'radarDotGreen', 0.7)

        let p2 = new WeaponPlatform({scene: this, key: 'mageHatPlatform'})
        p2.hatPlatform = true
        p2.weaponId = utils.msg().mageHat
        clientUtils.SetPosition(p2, 11500, 3600)
        p2.setDepth(utils.layers().map5)
        p2.setScale(1.7)
        p2.setStatic(true)
        AddToRadar(p2, 'radarDotGreen', 0.7)

        let p3 = new WeaponPlatform({scene: this, key: 'gokuHairPlatform'})
        p3.hatPlatform = true
        p3.weaponId = utils.msg().gokuHat
        clientUtils.SetPosition(p3, 3000, 6300)
        p3.setDepth(utils.layers().map5)
        p3.setScale(1.7)
        p3.setStatic(true)
        p3.platformCost *= 1.5
        AddToRadar(p3, 'radarDotGreen', 0.7)

        let p4 = new WeaponPlatform({scene: this, key: 'killuaHairPlatform'})
        p4.hatPlatform = true
        p4.weaponId = utils.msg().killuaHat
        clientUtils.SetPosition(p4, 2000, 9600)
        p4.setDepth(utils.layers().map5)
        p4.setScale(1.7)
        p4.setStatic(true)
        p4.platformCost *= 1.5
        AddToRadar(p4, 'radarDotGreen', 0.7)

        let p5 = new WeaponPlatform({scene: this, key: 'brainletPlatform'})
        p5.hatPlatform = true
        p5.weaponId = utils.msg().brainletHat
        clientUtils.SetPosition(p5, 7500, 6800)
        p5.setDepth(utils.layers().map5)
        p5.setScale(1.7)
        p5.setStatic(true)
        p5.platformCost *= 1.5
        AddToRadar(p5, 'radarDotGreen', 0.7)
    }

    GenerateTrees(multiplier){
        let rdg = new Phaser.Math.RandomDataGenerator()
        let maxx = 100
        let maxy = 100
        let mainSeed = `trees${mapSeed}`
        for(let x = 1; x <= maxx; x++){
            for(let y = 1; y <= maxy; y++){
                let seed = `${x}${y}${mainSeed}`
                rdg.sow(seed)
                if(rdg.between(0, 10000) <= 60 * multiplier){
                    let treeConfig = {
                        scene: this,
                        key: 'tree',
                    }
                    let sprite = new MapDecor(treeConfig)
                    sprite.x = x * (this.worldBoundsX / maxx)
                    sprite.y = y * (this.worldBoundsY / maxy)
                    sprite.setDepth(utils.layers().trees1) //0 is default depth. this is just like layers
                    //* a lot of this stuff like setCircle() needs done via our new dynamic config system now, where we simply put config.isCircle = true and itll handle it in the base constructor of the sprite. it will avoid a lot of problems because some things in the constructor expect to know if it is going to be a circle up front before deciding what the value or behavior of other things should be. its just the right way to do it.
                    sprite.setScale(rdg.between(80,115) / 45)
                    sprite.setCircle(sprite.displayWidth / 2 * 0.3) //. keep in mind this assigns a new body entirely, erasing things such as setSensor (it stops being a trigger), resets rotation of sprite, and more
                    sprite.setStatic(true)
                    let randomAngle = rdg.between(1, 360)
                    sprite.setRotation(Phaser.Math.DegToRad(randomAngle))
                }
            }
        }
    }

    GenerateBushes(multiplier){
        let rdg = new Phaser.Math.RandomDataGenerator()
        let maxx = 100
        let maxy = 100
        let mainSeed = `bushes${mapSeed}`
        for(let x = 1; x <= maxx; x++){
            for(let y = 1; y <= maxy; y++){
                let seed = `${x}${y}${mainSeed}`
                rdg.sow(seed)
                if(rdg.between(0, 10000) <= 160 * multiplier){
                    let bushConfig = {
                        scene: this,
                        key: 'bush',
                    }
                    let sprite = new MapDecor(bushConfig)
                    sprite.x = x * (this.worldBoundsX / maxx)
                    sprite.y = y * (this.worldBoundsY / maxy)
                    sprite.setDepth(utils.layers().entity2)
                    sprite.setScale(rdg.between(82,115) / 70)
                    sprite.setCircle(sprite.displayWidth / 2 * 0.75)
                    sprite.setStatic(true)
                }
            }
        }
    }

    GenerateRocks(multiplier){
        let rdg = new Phaser.Math.RandomDataGenerator()
        let maxx = 100
        let maxy = 100
        let mainSeed = `rocks${mapSeed}`
        for(let x = 1; x <= maxx; x++){
            for(let y = 1; y <= maxy; y++){
                let seed = `${x}${y}${mainSeed}`
                rdg.sow(seed)
                if(rdg.between(0, 10000) <= 45 * multiplier){
                    let rockConfig = {
                        scene: this,
                        key: 'rock',
                    }
                    let sprite = new MapDecor(rockConfig)
                    sprite.x = x * (this.worldBoundsX / maxx)
                    sprite.y = y * (this.worldBoundsY / maxy)
                    sprite.setDepth(utils.layers().obj4)
                    sprite.setScale(rdg.between(30,140) / 60)
                    sprite.setCircle(sprite.displayWidth / 2 * 0.75)
                    sprite.className = 'Rock' //unimportant. we have this here for a certain debug.log test we were doing
                    //sprite.setStatic(true)
                    sprite.setFriction(1,1,1)
                    sprite.canSpawnInWater = true //fightz.io allows rocks to spawn in water
                    let randomAngle = rdg.between(1, 360)
                    sprite.setRotation(Phaser.Math.DegToRad(randomAngle))
                }
            }
        }
    }

    GenerateWater(multiplier){
        let rdg = new Phaser.Math.RandomDataGenerator()
        let maxx = 100
        let maxy = 100
        let mainSeed = `water${mapSeed}`
        for(let x = 1; x <= maxx; x++){
            for(let y = 1; y <= maxy; y++){
                let seed = `${x}${y}${mainSeed}`
                rdg.sow(seed)
                if(rdg.between(0, 10000) <= 30 * multiplier){
                    let waterConfig = {
                        scene: this,
                        key: 'water',
                    }
                    let sprite = new Water(waterConfig)
                    sprite.useNetvars = false
                    sprite.x = x * (this.worldBoundsX / maxx)
                    sprite.y = y * (this.worldBoundsY / maxy)
                    sprite.setDepth(utils.layers().map)
                    sprite.setScale(rdg.between(70,130) / 90 * 1.45)
                    sprite.setRectangle(sprite.displayWidth * 0.8, sprite.displayHeight * 0.8)
                    sprite.setSensor(true) //turns it into a trigger like in unity pretty much
                    sprite.setStatic(true)
                    let randomAngle = rdg.between(1, 360)
                    sprite.setRotation(Phaser.Math.DegToRad(randomAngle))
                }
            }
        }
    }
}

var mouseX = 0
var mouseY = 0

function UpdatePointerPosition(){
    if(!player) return
    //* this isnt as simple as you think because the mouse x/y only updates relative to the camera if you are currently moving the mouse, soon as you stop moving it doenst update but you keep moving your character further away with WASD so it faces where your mouse was off screen instead of where the mouse coordinates should be now that the character moved.
    //. so what you gotta do is add the players last frame movement to the last known mouse x/y from when you were actually moving the mouse
    let pointer = game.input.activePointer
    //if the mouse just moved, the coordinates are correct already, they only become incorrect when you stop moving but the character keeps moving. so we dont gotta do nothin this frame
    if(pointer.justMoved){
        mouseX = pointer.worldX
        mouseY = pointer.worldY
        return
    }
    let v2_diff = new Phaser.Math.Vector2(player.x, player.y).subtract(playerPositionLastFrame)
    let newPointerXY = new Phaser.Math.Vector2(mouseX, mouseY).add(v2_diff)
    mouseX = newPointerXY.x
    mouseY = newPointerXY.y
}

function PlayerInputMove(){
    if(!AllowInputMove()) return
    let speed = 4.6 * player.MoveSpeedMult()
    if(player.inWater){
        speed *= 0.67
        if(player.inWater < 0) player.inWater = 0 //. sometimes this goes negative, i believe it is a bug with matterjs sensors.
    }
    let inputVector = GetInputVector()
    let moveVector = inputVector.normalize().scale(speed)
    if(inputVector.x != 0 || inputVector.y != 0) clientUtils.SetVelocity(player, moveVector.x, moveVector.y)
}

function AllowInputMove(){
    if(!player || chatting || player.shielding || player.stunned) return false
    return true
}

function GetInputVector(){
    let x = 0
    let y = 0
    if(keys.up.isDown || keys.arrowUp.isDown) y = -1
    if(keys.down.isDown || keys.arrowDown.isDown) y = 1
    if(keys.left.isDown || keys.arrowLeft.isDown) x = -1
    if(keys.right.isDown || keys.arrowRight.isDown) x = 1
    return new Phaser.Math.Vector2(x, y)
}

var chatting = false
var maxChatLength = 90 //characters

function ChatFocusCheck(){
    if(Phaser.Input.Keyboard.JustDown(keys.enter)){
        if(document.getElementById('chatField').hidden){
            chatting = true
            document.getElementById('chatField').hidden = false
            document.getElementById('chatField').focus()
            document.getElementById('chatField').value = ''
            document.getElementById('chatField').maxlength = maxChatLength
            for(let i in keys){
                keys[i].preventDefault = false //* this would stop the key presses of any keys defined in our keymap from propagating to any other element than the phaser game itself. meaning, if we have WASD defined in the key map, then WASD will be unable to be typed into any html text field. by default preventDefault is true. when we want to allow the player to type into a html text field though we need to set preventDefault = false so that they can type anything there.
            }
        }
        else{
            chatting = false
            document.getElementById('chatField').hidden = true
            document.getElementById('phaser').focus()
            for(let i in keys){
                keys[i].preventDefault = true //* pretty sure we dont necessarily NEED to prevent the keys from propagating, but for now, we do, because its the default phaser behavior
            }
            SendChatMessage(document.getElementById('chatField').value)
        }
    }
}

function SendChatMessage(msg){
    if(!msg || msg == '') return
    msg = msg.substring(0, maxChatLength) //trim the string to the max amount of characters to prevent exploits
    //* eventually we are going to want to compress this string i think but for now just send it because i dont know how to compress it
    socket.emit(utils.msg().chatMessage, [player.spriteId, msg])
}
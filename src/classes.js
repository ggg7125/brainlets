import {game} from './index'
import {socket, authority, SendToPlayerSpawn} from './client'
import { shieldBreakSfx, player, electricSfx } from './sceneTest';
import { bulletCache } from './bullets'
import { RefreshCameraZoom, RefreshMoneyUI, HelpPopup } from './ui';
import { GetAllNPCs, allNpcs } from './npcs';
import { EquipAbility } from './abilityCore';
import { GetHatByCode } from './hats';
import { InSafeZone, NetExplosion } from './clientUtilsES6';
import { AddToRadar, RemoveFromRadar } from './radar';
var clientUtils = require('./clientUtils')
var utils = require('../utils')

//. Phaser 3 does not call update on sprites and most other objects automatically anymore.
//* but it does call preUpdate automatically! and its the same thing apparently

//. IMPORTANT. the player's own body should be an overlay so it can be changed. The 'real' player is an invisible sprite with physics on it. Think of the visible body as just the same as a clothing overlay

//* possible way to do Overlays: Groups. Each player has its own group, in that group you put their clothes and weapons, and move the player by its group, scale it by its group, etc
//. VERY IMPORTANT: theres also Containers, which sound possibly more suited than Groups? google it
//Discord: @Tens you can attach a handler to the prerender event (I think?) which should happen after physics but before rendering

var lastSpriteId = 0

export function NewSpriteId(){
    lastSpriteId++
    return lastSpriteId
}

//. always use this to change a sprite's spriteId, because of the code within here that prevents duplicate spriteIds from occurring, especially on authority switches
//. ITS CRITICAL TO ONLY EVER UES THIS TO CHANGE A SPRITEID
export function SetSpriteId(id){
    if(lastSpriteId < id) lastSpriteId = id //ensure the next sprite id generated can never be less than one already assigned
    return id
}

export function GetLastSpriteId(){
    return lastSpriteId
}

export function SetLastSpriteId(n){
    lastSpriteId = n
}

//always use this to change a sprite's socketId because it updates the hashId too
export function SetSocketId(sprite, id){
    if(!id) return
    sprite.socketId = id
    sprite.hashId = utils.HashCode(id)
}

export class RadarDot extends Phaser.GameObjects.Sprite{
    constructor(config){
        super(config.scene, 0, 0, config.key)
        config.scene.add.existing(this)
        this.radarSprite = null //what actual sprite this radar dot represents in the world
        this.setDepth(200)
    }
}

export class Explosion extends Phaser.GameObjects.Sprite{
    constructor(config){
        super(config.scene, 0, 0, config.key)
        config.scene.add.existing(this)
        this.setDepth(utils.layers().entity4)
    }
}

//* an unaltered class of Phaser.GameObjects.Sprite in case for some reason we ever need to extend the core of Phaser's sprite system we already have all our other custom sprite classes extending from this instead of Phaser.GameObjects.Sprite because this way its easier to do alterations to the base ancestor of all of them
export class SpriteAncestor extends Phaser.GameObjects.Sprite{
    constructor(config){
        super(config.scene, 0, 0, config.key)
        config.scene.add.existing(this)
        let self = this
        this.className = 'SpriteAncestor'
        this.spriteName = null //* 'name' is already taken in javascript i think but this is OUR name var, we store the player's name here, NPC names if they have it. this specific instance's arbitrary name!
        this.spriteKey = config.key
        this.keyHash = utils.HashCode(config.key)
        this.isAPlayer = false //this var means any kind of player, local player or remote player, its just 'a player'
        //this.health = 100
        this.shieldHealth = 100
        this.shieldBroken = false
        this.shieldFullScale = 1.76
        this.lastShieldHealthEmitValue = 100
        this.lastShieldHealthEmitTime = 0
        this.stunned = false
        this.destroyDelegates = [] //list of delegates executed when Destroy() is called, so subclasses can register unique destroy code
        this.destroyed = false
        this.caches = false //if true this object caches itself for reuse and doesnt truly delete when Destroy is called
        this.cached = false //if it is currently in or out of its cache
        this.cacheCount = 0 //how many times this has been put in its cache. useful for checking if delayed code should still execute on it, if its already been reused for something then dont execute old delayed code
        this.creationTime = Date.now()
        this.setDepth(utils.layers().map6) //arbitrary
        this.collisionDelegates = []
        this.collisionStayDelegates = []
        this.collisionEndDelegates = []
        this.updateDelegates = [] //any functions in here are called in the preUpdate() loop
        this.useNetDestroy = false
        this.authorityDestroyOnly = true //* an example of this being false, is for bullets or other things that know when to delete its own self without a network message telling them to do so, they are allowed to delete without being the authority
        this.floatingName = null //the sprite of the floating name above this sprite's head if any
        this.overheadText = null //chat messages
        this.shielding = 0 //not false since we send a 1 or 0 over the network
        this.classRegenMod = 0
        //. by default SPRITE ANCESTOR is not networked, but SPRITE is, because we use Sprite Ancestor mostly for plain nonnetworked unspecial graphical stuff like a shield overlay that deletes itself as soon as you stop using it and doesnt needed networked but instead of specially handled on all local sides
        this.useNetvars = false //if false, it will not send any netvars, all netvars are stored on the relay server anyway, certain kinds of sprites just arent necessary for the state of the game and are handled 100% locally, like shield overlay.
        this.lastTakeDamage = 0
        this.xpGivenPerHit = 0 //every time the player hits this sprite they get this much xp
        setTimeout(function(){
            if(self) self.HealLoop()
        }, 500)
    }

    preUpdate(time, dt){
        super.preUpdate(time, dt)
        let self = this
        this.deltaTime = dt / 1000 //we have to divide by 1000 to use it like unity
        this.time = time
        
        if(this.cached || this.destroyed) return //our current thinking is that cached or destroyed objects dont need to run their update loop... //. more importantly, they should NOT be sending out netvar updates while cached or destroyed. if we remove this line here, there is NOTHING STOPPING A CACHED OR DESTROYED OBJECT FROM SENDING OUT NETVAR UPDATES. keep that in mind.

        for(let i in self.updateDelegates){
            self.updateDelegates[i].call(self)
        }
    }

    //. dont use anything other than this to destroy sprites, its our own function - it also destroys it across the network
    //* calls to Destroy done anywhere other than the authority are just ignored, as you can see in its first few lines of code here
    Destroy(fromAuthority){
        //console.log(`destroy attempt on spriteId ${this.spriteId}, spriteKey ${this.spriteKey}, className ${this.className}`)
        if(this.destroyed) return
        if(this.authorityDestroyOnly && (socket.id != authority && !fromAuthority)) return
        //* useNetDestroy, sometimes, for certain objects it is not necessary to tell it to be destroyed over the network, in fact it will cause problems. for example, bullets. bullets already have a timer on all sides that tells them when they should delete themselves, they dont need an emit to tell them to do so, in fact it would be a problem if they did, it is more synced that they have their own local timer and then go to their cache afterward, and saves us network traffic. so any object that already knows when it should delete itself, usually should have useNetDestroy = false.
        //. and also, usually have authorityDestroyOnly = false, or Destroy() will still be disallowed when attempting to use it locally
        if(socket.id == authority && this.useNetDestroy){
            //. EXTREMELY IMPORTANT. if you allow this emit() to be sent anywhere but the authority, it will cause an INFINITE LOOP, think about it, you destroy it on 1 side, that side sends an emit to destroy it on every other side, but then every other side ALSO sends an emit to destroy it on every other side, back and forth forever. SO NEVER LET ANYONE BUT THE AUTHORITY SEND THE EMIT HERE
            socket.emit(utils.msg().destroySprite, this.spriteId) //* destroy across the network
        }
        //console.log(`Destroy() ${this.className} at ${this.x}, ${this.y}`)
        for(let i in this.destroyDelegates) this.destroyDelegates[i]()
        if(this.caches) return
        clientUtils.AllSpritesRemove(this)
        for(let i in this.overlays) this.overlays[i].Destroy()
        this.destroyed = true
        //these are not sprites of our custom classes. they are phaser built in special text sprites. so we handle them like this
        if(this.floatingName) this.floatingName.destroy()
        if(this.overheadText) this.overheadText.destroy()
        //if this sprite does not use netvars there is no reference to it stored on the server anyway - by our current model as of writing this
        if(socket.id == authority && this.useNetvars){
            socket.emit(utils.msg().destroySpriteOnRelay, [this.spriteId, this.hashId]) //remove references to this sprite that are kept in storedData on the relay server to stop it from getting endlessly bloated with sprites and players that no longer exist //. we dont combine this with the 'destroySprite' emit above because that emit is sent out to all players, but this emit only needs to reach the relay, and not be sent out to anyone else, and it requires a different data set, and must always be sent on any destroy unlike the other emit which is only sent for sprites that have useNetDestroy = true and other conditions
        }
        this.destroy()
    }

    HealLoop(){
        let self = this
        if(!self.classRegenMod) return
        let delay = 0.2
        setInterval(function(){
            if(!self || !self.body || socket.id != authority) return //healing only happens on the authority since the authority just overrides it with health packet updates anyway
            let amount = 2 * delay * self.classRegenMod * self.RegenMod()
            if(InSafeZone(self.x, self.y)) amount += 10 * delay
            self.AddHealth(amount)
        }, delay * 1000)
    }

    AddHealth(amount){
        this.health += amount
        if(this.health < 0) this.health = 0
        if(this.health > 100) this.health = 100
    }

    SetHealth(hp){
        let diff = this.health - hp
        this.AddHealth(-diff)
    }

    TakeDamage(dmg, bypassShield){
        if(this.canAggro) this.aggressive = true
        if(this.npcBecomeFearfulOnAttack){
            this.npcFearful = true
        }
        this.lastTakeDamage = Date.now()
        if(this.shielding && !bypassShield){
            this.TakeShieldDamage(dmg)
            return
        }
        if(this.DmgReductionMult) dmg *= this.DmgReductionMult() //. notice how it doesnt help reduce shield dmg, this is intended
        this.AddHealth(-dmg)
        if(this.health <= 0){
            if(this.isEntity){
                this.health = 100
                if(this.isAPlayer){
                    SendToPlayerSpawn(this)
                }
                else{
                    this.Destroy() //in this case, an npc will respawn, not truly delete, because their cache var is set to true and they have a destroyDelegate to respawn themselves instead
                }
            }
            else{
                this.Destroy() //* keep in mind some things in Destroy are not truly destroyed, but instead will go invisible and respawn (trees/rocks), and/or be cached for reuse
            }
        }
    }

    AddShieldHealth(amount){
        this.shieldHealth += amount
        if(this.shieldHealth < 0) this.shieldHealth = 0
        if(this.shieldHealth >= 99){ //99 because networking problem, just go with it
            this.shieldHealth = 100
            this.shieldBroken = false
            //if(this == player) console.log('shieldBroken set to false')
        }
    }

    SetShieldHealth(hp){
        let diff = this.shieldHealth - hp
        this.AddShieldHealth(-diff)
        //console.log(`shield health set to ${this.shieldHealth}`)
    }

    //. seems damage only takes place on the authority - so this is being called on the authority
    TakeShieldDamage(dmg){
        dmg *= 0.67
        this.AddShieldHealth(-dmg)
        if(this.shieldHealth <= 0){
            this.ShieldBreak()
        }
        //reason clients need to know shield health is because the shields size/opacity/etc is based on the shield health, to show them when its about ot break
        //* we also have a loop that sends it every 0.67 seconds if needed but we send it here too for better responsiveness when taking damage
        this.NetSetShieldHealth(this.shieldHealth)
        //console.log(`${this.spriteId} TakeShieldDamage. shieldHealth = ${this.shieldHealth}`)
    }

    //. this seems to be the authority telling the owner of this player what their shield health should be - probably for the overlay's transparency since overlays are controlled client side then the client syncs them to everyone else
    NetSetShieldHealth(hp){
        if(socket.id != authority) return
        socket.emit(utils.msg().setShieldHealth, [this.playerSlot, Math.round(hp)]) //to the server, then out to whoever owns this player object
        this.lastShieldHealthEmitTime = Date.now()
        this.lastShieldHealthEmitValue = hp
    }

    ShieldBreak(skipNetShieldOff){
        //. skipNetShieldOff = true currently indicates that we are being ordered by the authority to perform this function. the authority has already emitted it to anyone who should have it so we do not perform any emits that would normally occur with skipNetShieldOff = false
        //console.log(`ShieldBreak(). skipNetShieldOff = ${skipNetShieldOff}`)
        //if(this.shieldBroken) return //if they are already shield broken we dont want to do this because it will spam ShieldBreak() on them because NetShieldOff() takes a while to truly turn it off because of latency and we dont want the spamming so we do this //* seems this isnt true, and it causes shield to stop working ever again after the first break if we dont comment this out
        let seconds = 5
        this.ApplyStun(seconds)
        //we skip NetShieldOff if we were told from an emit to perform ShieldBreak(), this stops an infinite loop of endless NetShieldOff() emits
        if(!skipNetShieldOff) this.NetShieldOff(this)
        this.shieldBroken = true
        if(player && Phaser.Math.Distance.Between(player.x, player.y, this.x, this.y) < 1000){
            shieldBreakSfx.play()
        }
        if(socket.id == authority && !skipNetShieldOff) socket.emit(utils.msg().shieldBreak, this.playerSlot)
    }

    NetShieldOff(){
        console.log('NetShieldOff()')
        if(socket.id != authority) return
        socket.emit(utils.msg().shieldOff, this.playerSlot)
    }

    ShieldUpdate(){
        this.ShieldRefill()
        this.ShieldAppearanceUpdate()
        this.EmitShieldHealthCheck()
    }

    ShieldRefill(){
        if(socket.id != authority) return
        if(this.shielding) return
        this.AddShieldHealth(10 * this.deltaTime)
    }

    EmitShieldHealthCheck(){
        if(!this.ShouldEmitShieldHealth()) return
        this.NetSetShieldHealth(this.shieldHealth)
    }

    ShouldEmitShieldHealth(){
        if(socket.id != authority) return
        if(this.lastShieldHealthEmitValue == this.shieldHealth) return false
        if(Date.now() - this.lastShieldHealthEmitTime < 0.67 * 1000) return false
        return true
    }

    ShieldAppearanceUpdate(){
        if(!this.shielding) return //prevent needless calculations
        let opacity = 0.3 + (this.shieldHealth / 100 * 0.7) //those 2 numbers here must add up to 1, like 0.3 + 0.7 for a total of 1 max alpha
        for(let i in this.overlays){
            let o = this.overlays[i]
            if(!o || !o.isShieldOverlay || o.alpha == opacity) continue
            o.setAlpha(opacity)
        }
    }

    ApplyStun(seconds){
        let self = this
        if(this.stunned) return //already stunned dont do it again
        this.stunned = true
        self.AddOverlay('electricOverlay', 1.5, false)
        electricSfx.play()
        setTimeout(function(){
            self.stunned = false
            self.RemoveOverlay('electricOverlay')
            electricSfx.stop()
        }, seconds * 1000)
    }
}

export class Overlay extends SpriteAncestor{
    constructor(config){
        super(config)
        this.className = 'Overlay'
        this.setDepth(utils.layers().entity3)
        this.useNetDestroy = false //this object doesnt need told to be destroyed across the network, its all handled locally, waste of an emit in whatever situation this is
        this.authorityDestroyOnly = false
        this.useNetvars = false //currently any sprite that does not use netvars will not be stored in the server's storedData, because as of writing this, the server getting a netvar update from a sprite is how the server knows that sprite exists, and stores netvar data about it. things like shield overlay do not need to be networked or have vars synced they are all handled locally then destroyed soon after. so best not to bloat the server's storedData with sprites like that, and better to save bandwidth by not sending their netvars anywhere
        this.overlayFollowRotation = true
        this.overlayScaleMod = 1
    }
}

//* remember this represents objects such as rocks as well as entities, so make sure to only put code that applies to both here
export class Sprite extends SpriteAncestor{
    //. VERY IMPORTANT: if you create a sprite, then add it to a group, the group settings will override any settings in this constructor, such as collideWorldBounds of the group will overwrite whatever is set here. really dumb, i know, but oh well
    constructor(config){
        super(config)
        let self = this
        this.netvars = {
            //. the 'range' parameter is still used for 'everyone' netvars for if a player joins then gets in that range and the last 'everyone' send was before they were on to receive it, then it will send it to them because they are in range and do not yet have the current value.
            posUpdate: {value: [1000,1000], rate: 1 / 15, range: 2000, threshold: 1, to: utils.netvarTo().range, compress: 'round'},
            angUpdate: {value: 0, rate: 1 / 15, range: 2000, threshold: 4, to: utils.netvarTo().range, compress: 'angle'},
            slowPosUpdate: {value: [1000,1000], rate: 2, range: 5000, threshold: 1, to: utils.netvarTo().everyone, compress: 'round'},
            scaleUpdate: {value: 1, rate: 1 / 10, range: 2000, threshold: 0.01, to: utils.netvarTo().range, compress: 'float'},
            health: {value: 100, rate: 1 / 4, range: 999, threshold: 2, to: utils.netvarTo().player, compress: 'round'},
            overlayData: {value: [], rate: 1 / 8, range: 1500, threshold: 0, to: utils.netvarTo().range, compress: null},
        }
        //. 'time' is the time that it was last sent by you, for time received look up the receiveTime var in this.netvarsSent)
        this.lastNetvarUpdate = 0
        this.netvarUpdateInterval = 1 / 10 //of a second

        this.className = 'Sprite'
        //console.log(`setting spriteId to ${this.spriteId} in constructor`)
        this.deltaTime = 0
        this.time = 0
        this.useNetDestroy = true //when its destroyed on the authority, it sends a message to destroy itself on all other clients
        this.useNetvars = true
        this.isMapDecor = false
        this.overlays = []
        this.socketId = null
        this.hashId = null
        this.stateUpdater = null //what client updates the state of this sprite. the authority does it by default
        //this.body.immovable = true //. what? this doesn't seem to be doing anything does it? things are still moving. not sure why this is here anyway
        self.colliderSize = 0.9
        self.isCircle = true
        self.sensor = false
        self.kb = false //if you are currently being knockbacked
        self.kbDistCovered = 0
        self.kbDistNeeded = 0
        self.kbRadian = 0
        self.spriteScale = 1

        //* override any of the above vars with anything defined in the config. this lets us dynamically add any var we want to change to the config, and even add new vars that dont even exist to the sprite out of the config
        //. make sure any code to use these vars for something is beneath this code, so it uses the overridden value instead of the default values above
        for(let i in config){
            this[i] = config[i]
        }

        this.scene.matter.add.gameObject(this)
        this.spriteId = NewSpriteId()
        if(self.isCircle) self.setCircle(self.displayWidth / 2 * self.colliderSize) //. radius, so width / 2 = whole sprite
        else self.setRectangle(self.displayWidth / 2 * self.colliderSize, self.displayHeight / 2 * self.colliderSize)
        self.setSensor(self.sensor)
        clientUtils.AllSpritesAdd(this)
        this.setInteractive()
        this.setFriction(0.15,0.15,0) //friction(1,1,1) makes the player not able to move anymore by WASD
        SetSocketId(this, config.socketId)
        //this.setBounce(0.75)
        //this.setBlendMode(1) //* makes it glow and stuff
        self.updateDelegates.push(self.SpriteUpdate)
        self.updateDelegates.push(self.KnockbackUpdate)
        
        this.on('pointerup', function(pointer){
            if(pointer.buttons != 1) return
            console.log('---------')
            console.log(`playerSlot = ${self.playerSlot}`)
            console.log(`socketId = ${self.socketId}`)
            //console.log(`hashId = ${self.hashId}`)
            console.log(`spriteId = ${self.spriteId}`)
            console.log(`stateUpdater = ${self.stateUpdater}`)
            console.log(`isSleeping ${self.body.isSleeping}`)
            //console.log(`className = ${self.className}`)
        })
        
        this.scene.game.events.on('prerender', function(){
            if(!self || self.destroyed) return //. IMPORTANT, we need to be removing this event when the object is destroyed but i dont know how
            self.UpdateOverlays()
            if(self.floatingName && !self.floatingName.destroyed){
                self.floatingName.setPosition(self.x, self.y - 113)
            }
            if(self.overheadText && !self.overheadText.destroyed){
                self.overheadText.setPosition(self.x, self.y - 200)
            }
        }, this)
    }

    //. only ever use this to set the scale of a sprite, never use Phaser's setScale() directly
    SetSpriteScale(n){
        this.setScale(n)
        this.spriteScale = n
    }

    SpriteUpdate(){
        this.InitNetvars() //this should be at the top
        if(this.isAPlayer) this.ShieldUpdate() //save some cpu
        this.LerpToPosUpdate()
        this.LerpToAngUpdate()
        //this should probably always be near the bottom - or some things would probably have to wait another frame before being sent out
        this.NetvarUpdate()
    }

    NetvarUpdate(){
        if(!this.useNetvars) return
        let time = Date.now()
        if(time - this.lastNetvarUpdate < this.netvarUpdateInterval * 1000) return //having every tree and rock and npc run this at 60 fps was too much
        this.lastNetvarUpdate = time
        this.UpdateNetvarSendValues()
        this.SendNetvars()
    }

    //this lerps our position to the netvar posUpdate
    LerpToPosUpdate(){
        if(!this.posUpdate) return
        if(!this.netvars.posUpdate.receiveTime) return //nothing has even been sent yet, this netvar is at its default value
        if(this.OwnsNetvar(this.netvars.posUpdate)) return //we are the ones who sent this out in the first place, we dont respond to it.

        if(!this.posUpdateVector) this.posUpdateVector = new Phaser.Math.Vector2()
        this.posUpdateVector.set(this.posUpdate[0], this.posUpdate[1])
        if(this.netvars.slowPosUpdate.receiveTime && this.netvars.posUpdate.receiveTime){
            if(this.netvars.slowPosUpdate.receiveTime > this.netvars.posUpdate.receiveTime){
                //slowPosUpdate is newer than posUpdate, so use it instead. keep in mine slowPosUpdate will never be able to move the sprite if you remove this code
                this.posUpdateVector.set(this.slowPosUpdate[0], this.slowPosUpdate[1])
            }
        }
        if(!this.curPosVector) this.curPosVector = new Phaser.Math.Vector2(this.x, this.y)
        this.curPosVector.set(this.x, this.y)
        if(!this.lerpedPosVector) this.lerpedPosVector = new Phaser.Math.Vector2(this.x, this.y)
        
        //sometimes if the distance is very long and we try to lerp through a bunch of objects, the player gets caught on them and never reaches the intended position, so we just need to teleport them there if the distance is so big theyre just gonna zoom rapidly to it anyway (but as i said zooming rapidly to it doesnt work when they get caught on objects in the way)
        //. point being lerping only really works over short enough distances that it wont get caught on a rock or such. it happens. we had this problem. thats why this code is here.
        if(Phaser.Math.Distance.Between(this.x, this.y, this.posUpdateVector.x, this.posUpdateVector.y) > 400){
            clientUtils.SetPosition(this, this.posUpdateVector.x, this.posUpdateVector.y) //just teleport them there, the distance is too vast and causes problems
        }
        else if(utils.Distance(this.x, this.y, this.posUpdateVector.x, this.posUpdateVector.y) > 3){
            let v2Lerp = this.curPosVector.lerp(this.posUpdateVector, this.deltaTime / 0.1)
            this.lerpedPosVector.set(v2Lerp.x, v2Lerp.y)
            clientUtils.SetPosition(this, this.lerpedPosVector.x, this.lerpedPosVector.y)
        }
    }

    //this lerps us to the netvar angUpdate
    LerpToAngUpdate(){
        if(this.angUpdate == undefined) return
        if(!this.netvars.angUpdate.receiveTime) return //nothing has ever been sent yet, its at the default value
        if(this.OwnsNetvar(this.netvars.angUpdate)) return //we are the sender of this var, we do not send it to ourselves
        let radian = Phaser.Math.DegToRad(this.angUpdate)
        let lerpRadian = utils.angleLerp(this.rotation, radian, this.deltaTime / 0.08)
        this.setRotation(lerpRadian)
    }

    InitNetvars(){
        if(this.initNetvars) return
        this.initNetvars = true
        let skipOwnCheck = true
        this.UpdateSpecialNetvarValues(skipOwnCheck)
        let time = Date.now()
        this.netvarsSent = {}
        this.netvarDefaults = {}
        for(let key in this.netvars){
            this[key] = this.netvars[key].value
            //now add parameters common to all netvars
            this.netvars[key].previousReceivers = {}
            this.netvars[key].neverChanged = true
            this.netvarsSent[key] = {value: this.netvars[key].value, time: time} //we prefill netvarsSent so that a newly created object will not emit all of its netvars at once upon creation because it thinks the values have changed from their last sent values, when really they're all still at their default values
            this.netvarDefaults[key] = utils.CloneObject(this.netvars[key])
        }
        //* remember dictionaries are passed by reference so putting dict1 = dict2 does NOT create an instance but they are the same object and changing one's value will change the other
    }

    UpdateNetvarSendValues(){
        if(!this.useNetvars) return
        for(let key in this.netvars){
            if(!this.OwnsNetvar(this.netvars[key])) continue
            this.netvars[key].value = this[key]
        }
        this.UpdateSpecialNetvarValues()
        for(let key in this.netvars){
            if(!this.NetvarValuesMatch(this.netvars[key].value, this.netvarDefaults[key].value)){
                this.netvars[key].neverChanged = false //this netvar has now at some point been changed from its default value
            }
        }
        //. js floats are only accurate to about the 12th decimal so we need to round some because it can cause the game to think a value with too many decimals has changed since last time it sent it even though it hasnt and mistakenly sends it out. we saw this ourselves in the console.log tests, this.x would be like 1396.7385624653867, and even though the sprite hadnt moved, next console.log would print 1396.7385624653865. this is a confirmed thing that happens we tested it heavily.
        let roundMult = 10000 //10000 = 4 decimal places. 1000 = 3. 100000 = 5
        for(let key in this.netvars){
            let netvar = this.netvars[key]
            if(typeof netvar.value == 'number') netvar.value = Math.round(netvar.value * roundMult) / roundMult
            if(Array.isArray(netvar.value)){
                for(let i in netvar.value){
                    let n = netvar.value[i]
                    if(typeof n == 'number') netvar.value[i] = Math.round(n * roundMult) / roundMult
                }
            }
            this.netvars[key].value = netvar.value //idk why but it seems to be a reference not an instance so we now reassign it here
            //if(this.className == 'Player') console.log(this.netvars[key].value)
        }
    }

    NeedsCurrentValue(p, varName){
        let varData = this.netvars[varName]
        if(!varData || varData.neverChanged == true) return false //if the value never changed from its default then no one needs it
        //previousReceivers is a dictionary of everyone this var has ever been sent to. key: socketId, value: whatever the var's value was at the time
        if(varData.previousReceivers[p.socketId] == undefined) return true //we have never sent to this person, they need it
        if(!this.NetvarThresholdReady(varData, {value: varData.previousReceivers[p.socketId]})) return false //the current value, and the last value we sent them, compared
        if(Array.isArray(varData.value)){
            if(varData.previousReceivers[p.socketId].length != varData.value.length) return true
            if(JSON.stringify(varData.previousReceivers[p.socketId]) !== JSON.stringify(varData.value)) return true
        }
        else if(varData.previousReceivers[p.socketId] != varData.value) return true //if the last value we sent them is not the current value, they need it
        return false
    }

    //. this is where the authority checks if a netvar value has changed and sends it out if so. everyone else has to match their vars to what the authority sends them.
    SendNetvars(){
        if(!this.useNetvars || !this.initNetvars) return
        let time = Date.now()
        let varIndex = -1 //start at -1 so we can increment immediately in the loop, leaving a starting value of 0 by the time itll be used by anything
        for(let i in this.netvars){
            varIndex++
            let varName = i
            let varData = this.netvars[i]
            if(varData.disabled === true) continue //for certain classes we disable certain netvars to save bandwidth
            if(!this.OwnsNetvar(varData)) continue
            if(varData.to == utils.netvarTo().player && !this.isAPlayer) continue //a player sending a message to its owner, but if this isnt a player, skip it
            let lastData = this.netvarsSent[i]
            let varReady = this.NetvarReady(varData, lastData) //varReady means the var is FULLY ready: value has changed, and send rate has elapsed, and threshold has been met
            let id = this.spriteId
            if(varData.to == utils.netvarTo().player) id = this.playerSlot //we use playerSlot when possible as they are always 1 byte, whereas spriteId > 255 becomes 2 bytes
            let receivers = []
            //to 'server' and to 'player' do not need a list of receivers
            let checkEveryoneReceivers = (varData.to == utils.netvarTo().everyone && !varReady) //. we only need to check special receivers for 'everyone' vars when the var is not fully ready to be sent to everyone, but instead only needs sent to those without the current value. if we are ready to send to everyone anyway we dont need to construct a list of special receivers, we just simply send it to everyone at once.
            if(varData.to == utils.netvarTo().range || checkEveryoneReceivers){
                for(let p of clientUtils.GetPlayers()){
                    if(p.socketId == this.socketId) continue
                    if(clientUtils.SpriteDistance(this, p) < varData.range && this.NeedsCurrentValue(p, varName) && this.NetvarTimeReady(varData, lastData)){
                        receivers.push(p)
                    }
                }
            }
            let receiverData
            if(receivers.length == 1) receiverData = receivers[0].playerSlot
            else if(receivers.length > 1){
                receiverData = []
                for(let i5 in receivers){
                    receiverData.push(receivers[i5].playerSlot)
                }
            }

            let toMethod = varData.to
            if(varData.to == utils.netvarTo().everyone && receiverData) toMethod = utils.netvarTo().range

            let data = [toMethod, id, varIndex, clientUtils.NetVarCompress(varData).value]
            if(receiverData) data.push(receiverData)

            if(receiverData || receiverData === 0 || varReady){
                for(let i9 in receivers){
                    varData.previousReceivers[receivers[i9].socketId] = varData.value
                }
                if(this == player && i == 'overlayData') console.log(`${this.spriteId} emitted overlay data`)
                socket.emit(utils.msg().netvar, data) //. now we still send it even if there is no receivers when the var is fully ready because we want the server to get the data so it can store it AND because the authority always gets these emits (from others) specially relayed to them regardless of range. if someone else sends to range 999 but the authority is farther than that the relay server stills ends it to them so they know the current position/vars of everyone regardless of range
                lastData.value = varData.value
                lastData.time = time
            }
        }
    }

    NetvarValuesMatch(v1, v2){
        if(v1 == v2) return true
        if(Array.isArray(v1)){
            if(v1.length != v2.length) return false
            if(JSON.stringify(v1) === JSON.stringify(v2)) return true
        }
        return false
    }

    NetvarReady(varData, lastData){
        if(this.NetvarTimeReady(varData, lastData) && this.NetvarValueReady(varData, lastData)) return true
        return false
    }

    NetvarTimeReady(varData, lastData){
        if(Date.now() - lastData.time >= varData.rate * 1000) return true
        return false
    }

    NetvarValueReady(varData, lastData){
        if(lastData === undefined) return true //idk why
        if(varData.value === lastData.value) return false //note this does not work on arrays. 2 arrays containing the exact same elements will still say they arent the same
        if(!this.NetvarThresholdReady(varData, lastData)) return false
        if(Array.isArray(varData.value) && JSON.stringify(varData.value) === JSON.stringify(lastData.value)) return false //. this is how you do Array equality checks
        return true
    }

    NetvarThresholdReady(varData, lastData){
        if(varData.threshold == undefined || varData.threshold === 0) return true
        if(typeof varData.value == 'number' && Math.abs(varData.value - lastData.value) >= varData.threshold) return true
        if(Array.isArray(varData.value)){
            for(let i in varData.value){
                if(typeof varData.value[i] == 'number' && Math.abs(varData.value[i] - lastData.value[i]) >= varData.threshold) return true
            }
        }
        return false
    }

    //these variables need special handling here because they are a type of netvar whose value is not directly usable but must be converted FROM something that is directly usable. for example for posUpdate to be sent over the network in needs to be an array like [0,0] but the real variable on the sprite that is able to be used directly is just sprite.x and sprite.y, and we have to always be converting it into an array and then assigning that value to the appropriate netvar for netvars to use it.
    UpdateSpecialNetvarValues(skipOwnCheck){
        if(skipOwnCheck || this.OwnsNetvar(this.netvars.posUpdate)) this.netvars.posUpdate.value = [this.x, this.y]
        if(skipOwnCheck || this.OwnsNetvar(this.netvars.angUpdate)) this.netvars.angUpdate.value = this.angle
        if(skipOwnCheck || this.OwnsNetvar(this.netvars.slowPosUpdate)) this.netvars.slowPosUpdate.value = [this.x, this.y]
        if(skipOwnCheck || this.OwnsNetvar(this.netvars.scaleUpdate)) this.netvars.scaleUpdate.value = this.scaleX
        if(skipOwnCheck || this.OwnsNetvar(this.netvars.overlayData)){
            let data = []
            for(let o of this.overlays){
                let id = clientUtils.SpriteKeyToId(o.spriteKey)
                let alpha = utils.CompressAlpha(o.alpha)
                let oData = [id, alpha]
                data.push(oData)
            }
            this.netvars.overlayData.value = data
        }
    }

    NetvarReceiverSpecialHandling(varKey, netVar, previousValue){
        if(varKey === 'scaleUpdate'){
            this.SetSpriteScale(netVar.value)
        }
        //for overlay data, we must remove overlays that are no longer supposed to be there, and add ones that are supposed to be there but arent
        if(varKey === 'overlayData'){
            //console.log(`received overlay update for sprite ${this.spriteId}`)
            if(JSON.stringify(netVar.value) !== JSON.stringify(previousValue)){
                //remove overlays that are no longer supposed to be on us
                for(let o of this.overlays){
                    let keep = false
                    for(let i in netVar.value){
                        let oData = netVar.value[i]
                        let id = oData[0]
                        if(id == clientUtils.SpriteKeyToId(o.spriteKey)){
                            keep = true
                            let alpha = utils.DecompressAlpha(oData[1])
                            o.setAlpha(alpha)
                            break
                        }
                    }
                    if(keep == false){
                        let skipAuthorityCheck = true
                        this.RemoveOverlay(o.spriteKey, skipAuthorityCheck)
                    }
                }
                //add overlays that are supposed to be on us but currently arent
                for(let i in netVar.value){
                    let oData = netVar.value[i]
                    let id = oData[0]
                    let key = clientUtils.SpriteIdToKey(id)
                    let found = false
                    for(let o in this.overlays){
                        if(o.spriteKey == key){
                            found = true
                            break
                        }
                    }
                    if(found == false){
                        let skipAuthorityCheck = true
                        let overlay = this.AddOverlay(key, 1, true, skipAuthorityCheck)
                        if(this == player) console.log('add overlay by receiver')
                        if(overlay){
                            let alpha = utils.DecompressAlpha(oData[1])
                            overlay.setAlpha(alpha)
                        }
                    }
                }
            }
        }
    }

    //if true, we are the state updater for this netvar. we are the ones who send it out.
    OwnsNetvar(netVar){
        if(netVar == undefined) return false //we passed the name of a var that doesnt exist
        if(netVar.local && this.WeAreStateUpdater()) return true
        if(!netVar.local && socket.id == authority) return true //this is not a local netvar, and we are the authority, so it falls to us to be the owner of all non-local netvars
        return false
    }

    //. confirmed. this function uses correct logic. and stateUpdater is always assigned properly in CreateLocalPlayer() and CreateRemotePlayer() in client.js.
    WeAreStateUpdater(){
        if(socket.id == authority && !this.stateUpdater) return true //null stateUpdater means authority is the state updater - this is probably an npc
        if(this.stateUpdater && socket.id === this.stateUpdater) return true //we own this object. so ignore certain messages from others telling us to move this object or some other things depending on context.
        return false
    }

    AddXP(xp){
        if(socket.id != authority) return
        this.xp += xp
        if(this.xp >= this.xpNeeded) this.LevelUp()
    }

    SetXP(xp){
        let diff = xp - this.xp
        this.AddXP(diff)
    }

    LevelUp(){
        if(socket.id != authority) return //level ups are gained on the server only
        this.xp -= this.xpNeeded
        this.level++
        //if(this.level >= 10) this.xpNeeded *= 1.42
        //else this.xpNeeded += 10
        this.xpNeeded *= 1.08
        this.statPoints += 1
        /*this.StatLevel('powerStat', 1, false)
        this.StatLevel('durabilityStat', 1, false)
        this.StatLevel('speedStat', 1, false)
        this.StatLevel('staminaStat', 1, false)
        this.StatLevel('vitalityStat', 1, false)
        this.StatLevel('spiritStat', 1, false)*/

    }

    UpdateOverlays(){
        if(this.destroyed || this.isMapDecor) return //because of an error i was getting idk why, 'position is not a member of undefined' or something like that
        for(let i in this.overlays){
            let o = this.overlays[i]
            o.setPosition(this.x, this.y)
            if(o.overlayFollowRotation == true) o.rotation = this.rotation
            o.scaleX = this.scaleX * o.overlayScaleMod
            o.scaleY = this.scaleY * o.overlayScaleMod
        }
    }

    //whether you are the one in control of this sprite's overlays or not.
    IsOverlayAuthority(){
        if(this.OwnsNetvar(this.netvars.overlayData)) return true
        return false
    }

    HasOverlay(name){
        for(let o of this.overlays){
            if(o.spriteKey == name) return true
        }
        return false
    }

    AddOverlay(name, scaleMod, followRotation, skipAuthorityCheck){
        if(followRotation === undefined) followRotation = true
        if(!name || this.HasOverlay(name)) return //. current implementation only allows 1 overlay of a particular name.
        if(!this.IsOverlayAuthority() && !skipAuthorityCheck) return
        let config = {
            scene: this.scene,
            key: name,
        }
        let o = new Overlay(config)

        //. here we do special things unique to certain overlays we know need special handling instead of having to do it over the network, so we save data
        //* for example 'electric' we know we need it to play its animation and to add some color so we do that here
        //* and for shield we know the icon is undersized (less build size) so we scale it up to fit the player
        if(name === 'electricOverlay'){
            o.setTintFill(0x6FA8DC)
            scaleMod = 1.7
            setTimeout(function(){
                o.anims.play('electricOverlay')
            }, 200)
        }
        if(name === 'shield'){
            scaleMod = this.shieldFullScale
            followRotation = false
        }
        if(name === 'staff'){
            scaleMod = 1
        }
        if(name === 'brainletHat'){
            followRotation = false
        }

        if(scaleMod) o.overlayScaleMod = scaleMod
        o.overlayFollowRotation = followRotation
        this.overlays.push(o)
        console.log(`${name} overlay added to playerSlot ${this.playerSlot}`)
        return o //. just in case we need to make further modifications somewhere after using AddOverlay
    }

    RemoveOverlay(name, skipAuthorityCheck){
        if(!name || !this.HasOverlay(name)) return
        if(!this.IsOverlayAuthority() && !skipAuthorityCheck) return
        for(let i in this.overlays){
            let o = this.overlays[i]
            if(o.spriteKey != name) continue
            this.overlays = utils.remove(this.overlays, o)
            o.Destroy()
        }
    }

    //a wrapper of knockback for when 1 sprite knockbacks another sprite, it calculates some vars about what angle and how far the knock should be based on the 2 sprite's stats etc
    KnockbackFrom(s){
        let dist = 200
        let radian = Phaser.Math.Angle.BetweenPoints(s, this)
        this.Knockback(dist, radian)
    }

    //a wrapper of knockback to make the person be knocked away from a point on the map
    KnockbackAwayFromPoint(x, y, dist, skipAuthorityCheck){
        let radian = Phaser.Math.Angle.Between(x, y, this.x, this.y)
        this.Knockback(dist, radian, skipAuthorityCheck)
    }

    //radian is the angle along which the player is being knocked along
    Knockback(dist, radian, skipAuthorityCheck){
        let self = this
        if(!skipAuthorityCheck && socket.id != authority) return //we skip authority check when the authority has sent us an emit ordering us to perform the knockback on this side regardless
        if(!self.WeAreStateUpdater()){
            //tell whoever is the state updater a knockback needs to happen - reminder: players are the state updaters of themselves (position/rotation) and all npcs state updaters is the authority
            let compressedAngle = utils.CompressAngle(Phaser.Math.RadToDeg(radian))
            socket.emit(utils.msg().knockback, [this.hashId, this.spriteId, dist, compressedAngle])
            return
        }
        self.kb = true
        self.kbDistCovered = 0
        self.kbDistNeeded = dist
        self.kbRadian = radian
        //now preUpdate will handle the rest of the knockback using these variables
    }

    KnockbackUpdate(){
        let self = this
        if(self.kb == false) return
        let v2 = utils.Radian2Vector(self.kbRadian) //a vector (as an array ([x, y])) whos x and y points along the angle we provided, and has a magnitude of 1
        let velocity = 550
        let velX = v2[0] * velocity * self.deltaTime
        let velY = v2[1] * velocity * self.deltaTime
        clientUtils.SetPosition(self, self.x + velX, self.y + velY)
        self.kbDistCovered += velocity * self.deltaTime
        if(self.kbDistCovered >= self.kbDistNeeded){
            self.kb = false
        }
    }
}

export class Entity extends Sprite{
    constructor(config){
        super(config)
        let self = this
        this.isEntity = true
        this.className = 'Entity'
        this.enemyAIstarted = false
        this.lastEnemyRetargetTime = 0
        this.enemyTarget = null
        clientUtils.EntityListAdd(this)
        this.setDepth(utils.layers().entity)
        this.updateDelegates.push(this.EnemyAIUpdate)
        this.lastAttackTime = 0 //the last time this entity performed any attack
        this.meleeDelay = 1000 //time in between being able to melee attack
        this.NpcAttackRange = 100 //the range from the player when it is considered acceptable to melee attack them
        this.aggressive = true
        this.baseAggressive = true //whether its this npc's nature to be aggressive or if theyre only doing it in defense
        this.npcAggressiveDist = 700
        this.nextNpcAngleChange = 0
        this.npcWanderAngle = 0
        this.stamina = 100 //i think stamina only matters to the client, no other side needs to know it
        this.lastAbilityUse = 0
        this.aggroTarget = null
        this.aggroUntil = 0
        this.nextAggro = 0
        this.canAggro = false
        this.baseNpcFearful = false
        this.npcFearful = false
        this.npcBecomeFearfulOnAttack = false
        this.money = 0

        //these are the stats you can put points into. they go up by +1 every time.
        this.netvars.statPoints = {value: 1, rate: 1 / 5, range: 999, threshold: 0, to: utils.netvarTo().player, compress: null}
        this.netvars.powerStat = {value: 0, rate: 1 / 5, range: 999, threshold: 0, to: utils.netvarTo().player, compress: null}
        this.netvars.durabilityStat = {value: 0, rate: 1 / 5, range: 999, threshold: 0, to: utils.netvarTo().player, compress: null}
        this.netvars.speedStat = {value: 0, rate: 1 / 5, range: 999, threshold: 0, to: utils.netvarTo().player, compress: null}
        this.netvars.staminaStat = {value: 0, rate: 1 / 5, range: 999, threshold: 0, to: utils.netvarTo().player, compress: null}
        this.netvars.vitalityStat = {value: 0, rate: 1 / 5, range: 999, threshold: 0, to: utils.netvarTo().player, compress: null}
        this.netvars.spiritStat = {value: 0, rate: 1 / 5, range: 999, threshold: 0, to: utils.netvarTo().player, compress: null}

        this.netvars.level = {value: 1, rate: 1, range: 999, threshold: 0, to: utils.netvarTo().player, compress: null}
        this.netvars.xp = {value: 0, rate: 1 / 3, range: 999, threshold: 3, to: utils.netvarTo().player, compress: 'round'}
        this.netvars.xpNeeded = {value: 100, rate: 1 / 3, range: 999, threshold: 0, to: utils.netvarTo().player, compress: 'round'}
        this.netvars.shielding = {value: 0, rate: 1 / 30, range: 999, threshold: 0, to: utils.netvarTo().authority, compress: null}

        setTimeout(function(){
            if(!self.isAPlayer) return //save some cpu
            self.StamRefill()
            self.PassiveXP()
        }, 500)
    }

    AddMoney(n){
        this.money += n
        if(this === player){
            RefreshMoneyUI()
        }
    }

    StamRefill(){
        let self = this
        let delay = 0.2
        setInterval(function(){
            if(!self) return
            if(Date.now() - self.lastAbilityUse > 1500){
                self.AddStam(13.5 * delay * self.RecovMod())
            }
        }, delay * 1000)
    }

    //gain passive xp from spirit
    PassiveXP(){
        let self = this
        let delay = 0.2
        setInterval(function(){
            if(self.spiritStat > 0){
                let xp = self.spiritStat * 1
                xp *= delay
                self.AddXP(xp)
            }
        }, delay * 1000)
    }

    AddStam(amount){
        this.stamina += amount
        if(this.stamina < 0) this.stamina = 0
        if(this.stamina > 100) this.stamina = 100
    }

    SetStam(stam){
        let diff = this.stamina - stam
        this.AddStam(-diff)
    }

    RecovMod(){
        return 1 //. if we ever want stam to recharge at differing rates we can worry about how to do it then
        let under1mult = 0.9
        let add = 0.15
        let mult = 1
        if(this.vitalityStat >= 0) mult = 1 + add * this.vitalityStat
        else mult = 1 * Math.pow(under1mult, Math.abs(this.vitalityStat))
        return mult        
    }

    MoveSpeedMult(){
        let under1mult = 0.9
        let add = 0.1
        let mult = 1
        if(this.speedStat >= 0) mult = 1 + add * this.speedStat
        else mult = 1 * Math.pow(under1mult, Math.abs(this.speedStat))
        return mult
    }

    CooldownMult(){
        let under1mult = 0.9
        let add = 0.1
        let mult = 1
        if(this.speedStat >= 0) mult = 1 + add * this.speedStat
        else mult = 1 * Math.pow(under1mult, Math.abs(this.speedStat))
        return 1 / mult
    }

    BulletTimeoutMult(){
        let under1mult = 0.9
        let add = 0.05
        let mult = 1
        if(this.spiritStat >= 0) mult = 1 + add * this.spiritStat
        else mult = 1 * Math.pow(under1mult, Math.abs(this.spiritStat))
        return mult
    }

    StamDrainMult(){
        let under1mult = 0.9
        let add = 0.15
        let mult = 1
        if(this.staminaStat >= 0) mult = 1 + add * this.staminaStat
        else mult = 1 * Math.pow(under1mult, Math.abs(this.staminaStat))
        //now for Power stat making things drain more
        if(this.powerStat > 0){
            mult *= 1 + (this.powerStat * 0.05)
        }
        return 1 / mult
    }

    DmgReductionMult(){
        let under1mult = 0.9
        let add = 0.1
        let mult = 1
        if(this.durabilityStat >= 0) mult = 1 + add * this.durabilityStat
        else mult = 1 * Math.pow(under1mult, Math.abs(this.durabilityStat))
        return 1 / mult
    }

    DmgMult(){
        let under1mult = 0.9
        let add = 0.1
        let mult = 1
        if(this.powerStat >= 0) mult = 1 + add * this.powerStat
        else mult = 1 * Math.pow(under1mult, Math.abs(this.powerStat))
        return mult
    }

    RegenMod(){
        let under1mult = 0.9
        let add = 0.15
        let mult = 1
        if(this.vitalityStat >= 0) mult = 1 + add * this.vitalityStat
        else mult = 1 * Math.pow(under1mult, Math.abs(this.vitalityStat))
        return mult        
    }

    ViewDistMod(){
        let under1mult = 0.9
        let add = 0.1
        let mult = 1
        if(this.spiritStat >= 0) mult = 1 + add * this.spiritStat
        else mult = 1 * Math.pow(under1mult, Math.abs(this.spiritStat))
        return 1 / Math.sqrt(mult)
    }

    TryStatLevel(varName, add){
        if(add === undefined) add = 1
        if(add >= 1 && this.statPoints < add) return
        this.StatLevel(varName, add)
    }

    //add: 1 increases level. -1 decreases level. varName = netvar name
    StatLevel(varName, add, takePoint){
        if(takePoint === undefined) takePoint = true
        let netvar = this.netvars[varName]
        if(!this.OwnsNetvar(netvar)) return
        add = Math.round(add)
        this[varName] += add
        if(takePoint) this.statPoints -= add
        
        if(varName === 'spiritStat') RefreshCameraZoom()
    }

    //. this is how NPCs attack people. they need to use an entirely different system than the player, because:
    //. 1) there is no need to create a projectile when an npc attacks - it would be inefficient anyway
    //. 2) there is no need to network it, they just attack on the authority and we already have code that transmits health changes anyway
    NPCAttackCheck(targ){
        let self = this
        if(!targ) return
        if(Date.now() - self.lastAttackTime < self.meleeDelay) return
        if(Phaser.Math.Distance.Between(self.x, self.y, targ.x, targ.y) > self.NpcAttackRange) return
        if(clientUtils.AbsLookAngle(self, targ) > 18) return
        self.lastAttackTime = Date.now()
        targ.TakeDamage(45 * self.DmgMult())
        targ.KnockbackFrom(self)
    }

    StartEnemyAI(){
        let self = this
        setTimeout(function(){
            self.npcStartPos = [self.x, self.y]
            self.npcMoveSpeed = 320 * self.MoveSpeedMult()
            self.aggressive = self.baseAggressive
            self.npcFearful = self.baseNpcFearful
            //start their AI on a random delay because if you generate a bunch of npcs at once like on startup and all their targeting loops are retargeting at the exact same time then you get frame drops
            setTimeout(function(){
                self.enemyAIstarted = true
            }, Math.random() * 1000)
        }, 100)
    }

    EnemyAIUpdate(){
        if(this.kb) return //. im pretty sure this is okay to do, we are just rigging it so the npc doesnt move while being knockbacked, if it ever causes problems, just change it - i anticipate disabling ALL npc ai like this just because theyre currently being knockbacked would eventually become not a good idea and makes no sense logically
        if(!this.enemyAIstarted || authority != socket.id) return
        if(this.npcBecomeFearfulOnAttack && this.baseNpcFearful == false && this.npcFearful == true && Date.now() - this.lastTakeDamage > 6 * 1000){
            this.npcFearful = this.baseNpcFearful
        }
        if(this.aggressive) this.AggressiveAI()
        else this.PassiveAI()
        if(this.baseAggressive == false && Date.now() - this.lastTakeDamage > 6 * 1000) this.aggressive = this.baseAggressive
    }

    //you attacked them, now they attack you
    NpcAggro(targ){
        if(!this.canAggro) return
        if(!targ || Date.now() < this.nextAggro || !this.enemyAIstarted) return
        this.aggroUntil = Date.now() + 6500
        this.aggroTarget = targ
        this.nextAggro = Date.now() + 5000 //cant change aggro targets until this time
    }

    AggressiveAI(){
        if(Date.now() > this.aggroUntil) this.aggroTarget = null
        let targ
        if(this.aggroTarget) targ = this.aggroTarget
        else targ = this.TryRetarget(2000)
        //if no one is within attack range but someone is within sight, wander around randomly so it looks like you are doing something
        if(!targ || (utils.Distance(this.x, this.y, targ.x, targ.y) > this.npcAggressiveDist && targ != this.aggroTarget)){
            this.PassiveAI()
            return
        }
        let myPos = new Phaser.Math.Vector2(this.x, this.y)
        let targPos = new Phaser.Math.Vector2(targ.x, targ.y)
        let ang = Phaser.Math.Angle.Between(this.x, this.y, targ.x, targ.y)
        let dir = targPos.clone().subtract(myPos).normalize()
        let speed = this.npcMoveSpeed
        let vel = dir.clone().scale(speed * this.deltaTime)
        let newPos = myPos.clone().add(vel)
        let lerpRadian = utils.angleLerp(this.rotation, ang, this.deltaTime / 0.23)
        this.setRotation(lerpRadian)
        let minDist = 230 //. at the time of writing this, if you move npcs too close, your bullets often pass through them, idk why yet.
        if(this.NpcAttackRange < minDist + 10) this.NpcAttackRange = minDist + 10 //safety check. wouldnt want npcs to never be able to attack now would we?
        if(myPos.distance(targPos) > minDist){
            clientUtils.SetPosition(this, newPos.x, newPos.y)
        }
        this.NPCAttackCheck(targ)
    }

    PassiveAI(){
        let targ = this.TryRetarget(1600) //no point moving if nobody is around to see it
        if(!targ) return
        if(this.npcFearful && (utils.Distance(this.x, this.y, targ.x, targ.y) < this.npcFearDist || Date.now() - this.lastTakeDamage < 3.5 * 1000)){
            let awayRadian = Phaser.Math.Angle.Between(targ.x, targ.y, this.x, this.y)
            let lerpRadian = utils.angleLerp(this.rotation, awayRadian, this.deltaTime / 0.35)
            this.setRotation(lerpRadian)
            let speed = this.npcMoveSpeed * this.deltaTime
            let velX = Math.cos(this.rotation) * speed
            let velY = Math.sin(this.rotation) * speed
            clientUtils.SetVelocity(this, velX, velY)
            this.npcWanderAngle = this.angle //eliminates some stuttering on the transition from running away to wandering again
        }
        else{
            if(Date.now() >= this.nextNpcAngleChange){
                this.nextNpcAngleChange = Date.now() + Math.random() * 1000 * 10
                this.npcWanderAngle = Math.random() * 360
            }
            let lerpRadian = utils.angleLerp(this.rotation, Phaser.Math.DegToRad(this.npcWanderAngle), this.deltaTime / 0.85)
            this.setRotation(lerpRadian)
            let speed = 0.5 * this.npcMoveSpeed * this.deltaTime //they move a little slower when they arent scared or attacking something, just wandering casually
            let velX = Math.cos(this.rotation) * speed
            let velY = Math.sin(this.rotation) * speed
            clientUtils.SetVelocity(this, velX, velY)
        }
    }

    TryRetarget(range){
        if(this.time - this.lastEnemyRetargetTime < 1200) return this.enemyTarget
        this.enemyTarget = null //clear out the old one
        this.lastEnemyRetargetTime = this.time
        this.enemyTarget = this.GetBestEnemyTarget(range)
        return this.enemyTarget
    }

    GetBestEnemyTarget(range){
        let near = clientUtils.GetPlayersInRange(this, range, true)
        let best = null
        let bestDist = 0
        for(let i in near){
            let o = near[i]
            if(!o || o == this) continue
            if(InSafeZone(o.x, o.y)) continue
            let dist = clientUtils.SpriteDistance(this, o)
            if(dist < bestDist || !best){
                best = o
                bestDist = dist
            }
        }
        if(!best || clientUtils.SpriteDistance(this, best) > range) return null
        return best
    }

    //here we put code that applies to initializing both Player & RemotePlayer classes. because we should have made the class inheritance be: Player = LocalPlayer & RemotePlayer but i dont feel like changing it now, so we do the lazy way and put common code for both of them here. this function is called in both of their constructors
    AllPlayersConstructor(){
        let self = this
        this.isAPlayer = true
        this.classRegenMod = 1
        this.lastHealthSendTime = 0
        this.lastHealthSendValue = 100
        this.destroyDelegates.push(function(){
            clientUtils.PlayerListRemove(self)
        })

        //* flag the appropriate netvars as 'local' - because players are the authority of their own position/rotation
        this.netvars.posUpdate.local = true
        this.netvars.angUpdate.local = true
        this.netvars.slowPosUpdate.local = true
        this.netvars.scaleUpdate.local = true
        this.netvars.overlayData.local = true
        this.netvars.shielding.local = true
    }
}

export class Player extends Entity{
    constructor(config){
        super(config)
        let self = this
        this.AllPlayersConstructor()
        this.className = 'Player'
        this.netvarUpdateInterval = 1 / 30
        this.inWater = 0
        this.weaponPlatform = null //what weapon platform you are currently standing on if any
        //. WARNING WARNING: Player & RemotePlayer MUST HAVE THE SAME EXACT SET OF NETVARS DEFINED, NOT MORE NOT LESS. BECAUSE OTHERWISE IT MESSES UP THE INDEX SENT BECAUSE WE ARE SENDING A NETVAR FROM PLAYER TO REMOTEPLAYER WHO IT VIEWS AS THE SAME OBJECT, AND VICE VERSA. IT SIMPLY WILL NOT WORK. TREAT THESE TWO CLASSES THE SAME AS FAR AS NETVARS GO.

        this.collisionDelegates.push(function(body){
            let s = body.gameObject
            if(s && self == player){
                if(s.className === 'Water'){
                    self.inWater++
                }
                if(s.className === 'WeaponPlatform'){
                    self.weaponPlatform = s
                }
            }
        })
        this.collisionStayDelegates.push(function(body){
            let s = body.gameObject
            if(s && self == player){
                if(s.className === 'WeaponPlatform'){
                    self.weaponPlatform = s
                }
            }
        })
        this.collisionEndDelegates.push(function(body){
            let s = body.gameObject
            if(s && self == player){
                if(s.className === 'Water'){
                    self.inWater--
                }
                if(s.className === 'WeaponPlatform'){
                    self.weaponPlatform = null
                }
            }
        })
    }
}

var negativeSpriteId = 0

function GetNewNegativeSpriteId(){
    negativeSpriteId -= 1
    return negativeSpriteId
}

export class RemotePlayer extends Entity{
    constructor(config){
        super(config)
        this.AllPlayersConstructor()
        this.className = 'RemotePlayer'
        this.netvarUpdateInterval = 1 / 20
        //RemotePlayers wait for the authority to tell them their spriteId, since RemotePlayers are not spawned on the authority but on that specific client who is not the authority, so its a different process to get a spriteId than most other sprites
        if(socket.id != authority){
            this.spriteId = GetNewNegativeSpriteId() //spriteId being negative means we are waiting for the value to be set properly by some remote source
        }
        //. WARNING WARNING: Player & RemotePlayer MUST HAVE THE SAME EXACT SET OF NETVARS DEFINED. BECAUSE OTHERWISE IT MESSES UP THE INDEX SENT BECAUSE WE ARE SENDING A NETVAR FROM PLAYER TO REMOTEPLAYER WHO IT VIEWS AS THE SAME OBJECT, AND VICE VERSA. IT SIMPLY WILL NOT WORK. TREAT THESE TWO CLASSES THE SAME AS FAR AS NETVARS GO.
    }
}

var respawnModes = {
    originalPos: 0,
    randomPos: 1,
    sameSpecies: 2,
}

export class Enemy extends Entity{
    constructor(config){
        super(config)
        let self = this
        this.className = 'Enemy' //we use this as a tag to send over the network when net spawning a class so what class to spawn can be identified
        this.netvarUpdateInterval = 1 / 10
        this.StartEnemyAI()
        this.caches = true //stops it from truly deleting when Destroy() is called, because we are going to just send them to the void and respawn them later instead
        this.meleeDelay = 1800 //we up their Entity.meleeDelay so that npcs attack pretty slow so players can take advantage of the delay and block then attack then block then attack etc
        this.baseNpcFearful = false
        this.npcFearDist = 450
        this.npcStartPos = [self.x, self.y]
        this.respawnMode = respawnModes.sameSpecies
        this.sameSpeciesSpawnChance = 0.7 //x100 for the % chance they will spawn at a member of their species, otherwise not
        this.xpGivenPerHit = 10
        this.npcMoneyDrop = 2
        
        //COPY THIS TO SET ANY NPCS STATS
        this.netvars.powerStat.value = 0
        this.netvars.durabilityStat.value = 0
        this.netvars.speedStat.value = 0
        this.netvars.staminaStat.value = 0
        this.netvars.vitalityStat.value = 0
        this.netvars.spiritStat.value = 0

        this.destroyDelegates.push(function(){
            SpawnMoneyAt(self.x, self.y, self.npcMoneyDrop)
            clientUtils.SetSleeping(self, true)
            self.setPosition(-1000, -1000)
            self.setVisible(false)
            self.setActive(false)
            setTimeout(function(){
                self.NpcRespawn()
                self.setVisible(true)
                self.setActive(true)
                self.SetHealth(100)
            }, 20 * 1000)
        })

        //the npc checks if it is too close to the spawn, if yes it will respawn itself to stay farther from the spawn
        setTimeout(function(){
            setInterval(function(){
                if(socket.id != authority) return
                if(InSafeZone(self.x, self.y)){
                    NetExplosion(self.x, self.y, 5)
                    self.NpcRespawn()
                }
            }, 1000)
        }, Math.random() * 2000)
    }

    NpcRespawn(){
        this.SetHealth(100)
        if(this.respawnMode == respawnModes.originalPos) this.setPosition(this.npcStartPos[0], this.npcStartPos[1])
        if(this.respawnMode == respawnModes.randomPos){
            let x = Phaser.Math.RND.between(500, game.scene.scenes[1].worldBoundsX - 500)
            let y = Phaser.Math.RND.between(500, game.scene.scenes[1].worldBoundsY - 500)
            this.setPosition(x, y)
        }
        if(this.respawnMode == respawnModes.sameSpecies){
            //we do this to weaken the effectiveness of always spawning on the same species - it always ends up with every single entity of that species clustered into 1 spot forever
            if(Math.random() > this.sameSpeciesSpawnChance){
                //this.setPosition(this.npcStartPos[0], this.npcStartPos[1]) //go back to native habitat
                let x = Phaser.Math.RND.between(500, game.scene.scenes[1].worldBoundsX - 500)
                let y = Phaser.Math.RND.between(500, game.scene.scenes[1].worldBoundsY - 500)
                this.setPosition(x, y)
            }
            else{
                let list = []
                for(let i in GetAllNPCs()){
                    let s = allNpcs[i]
                    if(s.active && s != self && !s.cached && !s.destroyed && s.className === this.className) list.push(s)
                }
                let s = utils.Pick(list)
                if(s) this.setPosition(s.x, s.y)
                else this.setPosition(this.npcStartPos[0], this.npcStartPos[1])
            }
        }
    }
}

export class Wolf extends Enemy{
    constructor(){
        let config = {
            scene: game.scene.scenes[1],
            key: 'wolf',
        }
        super(config)
        this.className = 'Wolf'
        this.SetSpriteScale(1.8)
        this.npcAggressiveDist = 1700
        this.canAggro = true
        this.baseNpcFearful = false
        this.npcBecomeFearfulOnAttack = false
        this.respawnMode = respawnModes.sameSpecies
        this.xpGivenPerHit *= 2
        this.npcMoneyDrop *= 1

        //COPY THIS TO SET ANY NPCS STATS
        this.netvars.powerStat.value = 0
        this.netvars.durabilityStat.value = 0
        this.netvars.speedStat.value = 0
        this.netvars.staminaStat.value = 0
        this.netvars.vitalityStat.value = 0
        this.netvars.spiritStat.value = 0
    }
}

export class Boar extends Enemy{
    constructor(){
        let config = {
            scene: game.scene.scenes[1],
            key: 'boar',
        }
        super(config)
        this.className = 'Boar'
        let scale = 1800
        if(Math.random() < 0.25) scale = Phaser.Math.RND.between(1000,1400)
        this.SetSpriteScale(scale / 1000)
        if(Math.random() < 0.7) this.baseAggressive = false
        this.npcAggressiveDist = 600
        this.canAggro = true
        this.baseNpcFearful = false
        this.npcBecomeFearfulOnAttack = false
        this.respawnMode = respawnModes.sameSpecies
        this.xpGivenPerHit *= 2
        this.npcMoneyDrop *= 2

        //COPY THIS TO SET ANY NPCS STATS
        this.netvars.powerStat.value = 0
        this.netvars.durabilityStat.value = 10
        this.netvars.speedStat.value = -4
        this.netvars.staminaStat.value = 0
        this.netvars.vitalityStat.value = 0
        this.netvars.spiritStat.value = 0
    }
}

export class Deer extends Enemy{
    constructor(){
        let config = {
            scene: game.scene.scenes[1],
            key: 'deer',
        }
        super(config)
        this.className = 'Deer'
        let scale = 1800
        if(Math.random() < 0.25) scale = 1350
        this.SetSpriteScale(scale / 1000)
        this.baseAggressive = false
        this.baseNpcFearful = true
        this.npcBecomeFearfulOnAttack = true
        this.npcFearDist = 650
        this.canAggro = false
        if(Math.random() < 0.4) this.canAggro = true
        this.npcAggressiveDist = 500
        this.respawnMode = respawnModes.sameSpecies
        this.xpGivenPerHit *= 1.5
        this.npcMoneyDrop *= 2

        //COPY THIS TO SET ANY NPCS STATS
        this.netvars.powerStat.value = -5
        this.netvars.durabilityStat.value = -5
        this.netvars.speedStat.value = 3
        this.netvars.staminaStat.value = 2
        this.netvars.vitalityStat.value = 2
        this.netvars.spiritStat.value = 3
    }
}

export class Rabbit extends Enemy{
    constructor(){
        let config = {
            scene: game.scene.scenes[1],
            key: 'rabbit',
        }
        super(config)
        this.className = 'Rabbit'
        let scale = 1800
        if(Math.random() < 0.25) scale = 1300
        this.SetSpriteScale(scale / 1000)
        this.baseAggressive = false
        this.baseNpcFearful = true
        this.npcBecomeFearfulOnAttack = true
        if(Math.random() < 0.4) this.baseNpcFearful = false
        this.npcFearDist = 700
        this.npcAggressiveDist = 450
        this.canAggro = false
        if(Math.random() < 0.12) this.canAggro = true
        this.respawnMode = respawnModes.sameSpecies
        this.xpGivenPerHit *= 1
        this.npcMoneyDrop *= 2

        //COPY THIS TO SET ANY NPCS STATS
        this.netvars.powerStat.value = -6
        this.netvars.durabilityStat.value = -7
        this.netvars.speedStat.value = 0
        this.netvars.staminaStat.value = 0
        this.netvars.vitalityStat.value = 0
        this.netvars.spiritStat.value = 0
    }
}

export class Chicken extends Enemy{
    constructor(){
        let config = {
            scene: game.scene.scenes[1],
            key: 'chicken',
        }
        super(config)
        this.className = 'Chicken'
        let scale = 1800
        if(Math.random() < 0.25) scale = 1200
        this.SetSpriteScale(scale / 1000)
        this.baseAggressive = false
        this.baseNpcFearful = true
        this.npcBecomeFearfulOnAttack = true
        if(Math.random() < 0.25) this.baseNpcFearful = false
        this.npcFearDist = 600
        this.canAggro = false
        this.npcAggressiveDist = 450
        this.respawnMode = respawnModes.sameSpecies
        this.xpGivenPerHit *= 1
        this.npcMoneyDrop *= 1

        //COPY THIS TO SET ANY NPCS STATS
        this.netvars.powerStat.value = -5
        this.netvars.durabilityStat.value = -10
        this.netvars.speedStat.value = 0
        this.netvars.staminaStat.value = 0
        this.netvars.vitalityStat.value = 0
        this.netvars.spiritStat.value = 0
    }
}

export class Lizard extends Enemy{
    constructor(){
        let config = {
            scene: game.scene.scenes[1],
            key: 'lizard',
        }
        super(config)
        this.className = 'Lizard'
        let scale = 1800
        if(Math.random() < 0.25) scale = 1000
        this.SetSpriteScale(scale / 1000)
        if(Math.random() < 0.2) this.SetSpriteScale(1.1) //baby lizard
        this.baseAggressive = false
        if(Math.random() < 0.15) this.baseAggressive = true
        this.baseNpcFearful = true
        this.npcBecomeFearfulOnAttack = false
        this.npcFearDist = 500
        this.canAggro = true
        this.npcAggressiveDist = 800
        this.respawnMode = respawnModes.sameSpecies
        this.xpGivenPerHit *= 1
        this.npcMoneyDrop *= 3

        //COPY THIS TO SET ANY NPCS STATS
        this.netvars.powerStat.value = -5
        this.netvars.durabilityStat.value = -5
        this.netvars.speedStat.value = 13
        this.netvars.staminaStat.value = 0
        this.netvars.vitalityStat.value = 0
        this.netvars.spiritStat.value = 0
    }
}

export class Rat extends Enemy{
    constructor(){
        let config = {
            scene: game.scene.scenes[1],
            key: 'rat',
        }
        super(config)
        this.className = 'Rat'
        let scale = 1250
        //if(Math.random() < 0.25) scale = 1000
        this.SetSpriteScale(scale / 1000)
        //if(Math.random() < 0.2) this.SetSpriteScale(1.1) //baby lizard
        this.baseAggressive = true
        //if(Math.random() < 0.15) this.baseAggressive = true
        this.baseNpcFearful = false
        this.npcBecomeFearfulOnAttack = false
        this.npcFearDist = 500
        this.canAggro = true
        this.npcAggressiveDist = 800
        this.respawnMode = respawnModes.sameSpecies
        this.sameSpeciesSpawnChance = 1
        this.xpGivenPerHit *= 1
        this.npcMoneyDrop *= 1

        //COPY THIS TO SET ANY NPCS STATS
        this.netvars.powerStat.value = -3
        this.netvars.durabilityStat.value = -5
        this.netvars.speedStat.value = 9
        this.netvars.staminaStat.value = 0
        this.netvars.vitalityStat.value = 0
        this.netvars.spiritStat.value = 0
    }
}

export class Zombie extends Enemy{
    constructor(){
        let config = {
            scene: game.scene.scenes[1],
            key: 'zombie',
        }
        super(config)
        this.className = 'Zombie'
        let scale = 2100
        if(Math.random() < 0.25) scale = 1850
        this.SetSpriteScale(scale / 1000)
        //if(Math.random() < 0.2) this.SetSpriteScale(1.1) //baby lizard
        this.baseAggressive = true
        //if(Math.random() < 0.15) this.baseAggressive = true
        this.baseNpcFearful = false
        this.npcBecomeFearfulOnAttack = false
        this.npcFearDist = 500
        this.canAggro = true
        this.npcAggressiveDist = 800
        this.respawnMode = respawnModes.sameSpecies
        this.sameSpeciesSpawnChance = 1
        this.xpGivenPerHit *= 1
        this.npcMoneyDrop *= 2

        //COPY THIS TO SET ANY NPCS STATS
        this.netvars.powerStat.value = 0
        this.netvars.durabilityStat.value = 15
        this.netvars.speedStat.value = 0
        this.netvars.staminaStat.value = 0
        this.netvars.vitalityStat.value = 0
        this.netvars.spiritStat.value = 0
    }
}

//mainly so we can disable some uneccessarily complex functionality that Sprite has to improve performance of map objects
export class MapDecor extends Sprite{
    constructor(config){
        config.isMapDecor = true
        super(config)
        let self = this
        this.className = 'MapDecor'
        this.netvarUpdateInterval = 1 / 10
        this.caches = true //if caches = true then the object does not truly delete, we do this because trees/rocks/etc respawn shortly after being destroyed
        this.isWater = false
        this.canSpawnInWater = false

        //make sure it cant spawn on water
        setTimeout(function(){
            if(self.canSpawnInWater || self.isWater) return
            for(let i in allWaters){
                let water = allWaters[i]
                if(clientUtils.Overlapping(self.body, water.body)){
                    self.caches = false
                    self.Destroy(true)
                }
            }            
        }, 5)
        
        this.destroyDelegates.push(function(){
            let pos = [self.x, self.y]
            self.setPosition(-2000, -2000) //if we dont do this also, the static collider remains behind for whatever reason.
            self.setVisible(false)
            self.setActive(false)
            self.health = 100
            setTimeout(function(){
                if(!self || !self.body) return
                self.setPosition(pos[0], pos[1])
                self.setVisible(true)
                self.setActive(true)
            }, 20 * 1000)
        })
    }
}

export var allWaters = []

export class Water extends MapDecor{
    constructor(config){
        config.isMapDecor = true
        super(config)
        let self = this
        this.className = 'Water'
        this.netvarUpdateInterval = 1 / 4
        this.isWater = true
        this.canSpawnInWater = true
        this.caches = true //if caches = true then the object does not truly delete, we do this because trees/rocks/etc respawn shortly after being destroyed
        allWaters.push(this)

        this.collisionDelegates.push(function(other){
            let s = other.gameObject
            if(s){
                //. makes sure no bushes, trees, rocks, etc are laying in water
                if(s.isMapDecor && s.className !== 'Water'){
                    s.setPosition(-1000, -1000)
                }
            }
        })
    }
}

export var allWeaponPlatforms = []

export class WeaponPlatform extends MapDecor{
    constructor(config){
        super(config)
        let self = this
        this.className = 'WeaponPlatform'
        this.canSpawnInWater = true
        this.isCircle = true
        this.sensor = true
        this.setSensor(true) //this.sensor doesnt seem to work, but we can fix that later
        this.netvarUpdateInterval = 1 / 3
        this.hatPlatform = false //if false, its a weapon that goes on LMB/RMB
        this.weaponId //or hat - example: utils.msg().barbarianHat
        this.platformCost = 20 //it cost this much coins to use this platform
        allWeaponPlatforms.push(this)
    }
}

//we have to resort to distance checking because for some reason using the sensors just would not work
//* no longer true. we have fixed the problems with sensors and collisions in general. but no point changing this now.
export function WeaponPlatformCheck(pointer){
    if(!player) return
    for(let i in allWeaponPlatforms){
        let p = allWeaponPlatforms[i]
        if(utils.Distance(player.x, player.y, p.x, p.y) < 115){
            if(player.money < p.platformCost){
                HelpPopup(`You need ${p.platformCost} gems to switch to this ability`, 2000)
                return
            }
            player.AddMoney(-p.platformCost)
            let abilitySlot = null
            if(pointer.buttons == 1) abilitySlot = 0
            if(pointer.buttons == 2) abilitySlot = 1
            if(abilitySlot != null){
                if(p.hatPlatform == true){
                    let h = GetHatByCode(p.weaponId)
                    h.Equip()
                }
                else{
                    EquipAbility(p.weaponId, abilitySlot)
                }
            }
            break
        }
    }
}

//. base bullet class. dont use this directly, use the subclasses
export class Bullet extends Sprite{
    constructor(config){
        if(!('sensor' in config)) config.sensor = true
        config.useNetDestroy = false //* bullets already know when they should delete themselves, they have a timer that deletes them, net destroy would only interfere with the known time it knows it should delete itself
        config.authorityDestroyOnly = false
        super(config)
        let self = this
        this.className = 'Bullet'
        this.isBullet = true
        this.netvarUpdateInterval = 1 / 40
        this.caches = true //this object does cache itself instead of delete
        this.percentDamage = 35
        this.bulletVelocity = 10
        this.bulletTimeout = 1000
        this.bulletVector = new Phaser.Math.Vector2()
        this.bulletOwner = null
        this.setDepth(utils.layers().obj4)
        this.updateDelegates.push(this.BulletUpdate)
        this.useNetvars = false //* pretty sure we dont want bullets sending out their pos/ang updates...their pos/ang & velocity are predetermined?
        this.bulletSpin = 0 //negative or positive for which way to spin and how fast
        this.bulletAngle = 0 //radian - the angle of travel, the direction this bullet will go in
        this.bulletExplosionSize = 0
        this.explodeOnDelete = true

        //* ON COLLISION
        this.collisionDelegates.push(function(other){ //. remember 'other' is a body not a sprite. use body.gameObject to interact with the sprite, which is almost always what you want to do
            if(self.cached || self.destroyed) return
            let s = other.gameObject //the sprite we collided with
            //sometimes 's' will be null, even though 'other' is not null, so we have to check that 's' exists before trying to interact with it
            if(s && s != self){
                if(s == self.bulletOwner || s.isSensor()) return //just pass over them
                if(self.bulletOwner && self.bulletOwner == s.bulletOwner) return //pass over your own bullets
                //. remember the above code is passing over anything that is a sensor, but ALL BLASTS are sensors, meaning they are going to ignore each other. even if 2 blasts of two different players collide. this will eventually be undesired behavior but for now it will be okay so we can move on faster. eventually we want collided blasts from 2 different people to destroy the weaker blast and decrease the remaining power of the other blast.
                if(socket.id == authority){
                    if(self.bulletOwner){
                        self.bulletOwner.AddXP(s.xpGivenPerHit * self.bulletXpMod)
                        //* now xp from hitting players
                        if(s.isAPlayer){
                            self.bulletOwner.AddXP((5 + s.level) * self.bulletXpMod)
                        }
                    }
                    s.TakeDamage(self.percentDamage)
                    if(s.NpcAggro) s.NpcAggro(self.bulletOwner)
                }
                self.Destroy()
            }
        })

        //* ON DESTROY
        //somehow this just works even when using 0 delay, it will have the className of the subclass as intended not 'Bullet' as seen above in this base class. the problem without using setTimeout(0) was that the className would be the parent class name not the className we have set in this specific constructor above.
        setTimeout(function(){
            self.destroyDelegates.push(function(){
                if(Date.now() < self.creationTime + self.bulletTimeout || self.explodeOnDelete == true){
                    self.BulletExplode(self.bulletExplosionSize)
                }
                let list = bulletCache[self.className]
                if(!list){
                    bulletCache[self.className] = []
                    list = bulletCache[self.className]
                }
                list.push(self)
                //bulletCache[self.className] = list //. pretty sure its already a reference
                self.cached = true
                self.cacheCount++
                //. WOW. we once had a bug where our cached blasts and our destroyed trees/rocks were both at -1000 -1000 in the void and this caused a very confusing bug where every time we retrieved a bullet from the cache it would hit a tree/rock that was 'not there', and it turned out it was hitting a tree/rock in the void every time it was requested for reuse because they were all stored in the same place.
                //* POINT BEING, DONT STORE CACHED OBJECTS IN THE SAME PLACE IN THE VOID
                clientUtils.SendToRandomVoid(self)
                clientUtils.SetVelocity(self, 0, 0) //stop moving!
                self.bulletVelocity = 0
                clientUtils.SetSleeping(self, true)
                self.setVisible(false)
                self.setActive(false)
            })
        }, 0)
    }

    BulletUpdate(){
        if(this.destroyed || this.cached) return
        this.BulletVelocity()
        this.BulletSpin()
        //check timeout
        if(!this.destroyed && !this.cached && Date.now() > this.creationTime + this.bulletTimeout){
            this.Destroy()
        }
    }

    BulletVelocity(){
        if(!this.bulletVelocity) return
        this.bulletVector.set(Math.cos(this.bulletAngle), Math.sin(this.bulletAngle)).scale(this.bulletVelocity)
        clientUtils.SetVelocity(this, this.bulletVector.x, this.bulletVector.y)
    }

    BulletSpin(){
        if(!this.bulletSpin) return
        this.angle += 360 * this.bulletSpin * this.deltaTime
    }

    BulletExplode(size){
        if(!size) return
        NetExplosion(this.x, this.y, size)
        this.BulletExplosionKnockback(size)
    }

    BulletExplosionKnockback(size){
        if(socket.id != authority) return
        let near = clientUtils.GetEntitiesInRange(this, 130 + (12 * size))
        for(let o of near){
            if(o === this.bulletOwner) continue
            console.log(o)
            o.KnockbackAwayFromPoint(this.x, this.y, 150)
        }
    }
}

export class MeleeBullet extends Bullet{
    constructor(){
        let config = {
            scene: game.scene.scenes[1],
            key: 'melee',
            sensor: true,
            isCircle: false,
            colliderSize: 0.7,
        }
        super(config)
        this.className = 'MeleeBullet'
    }
}

export class SwordBullet extends Bullet{
    constructor(){
        let config = {
            scene: game.scene.scenes[1],
            key: 'swordBullet',
            sensor: true,
            isCircle: true,
            colliderSize: 0.85,
        }
        super(config)
        this.className = 'SwordBullet'
        this.setScale(1.35)
    }
}

export class BlueKiBullet extends Bullet{
    constructor(){
        let config = {
            scene: game.scene.scenes[1],
            key: 'blueKiShot',
            sensor: true,
            isCircle: true,
            colliderSize: 0.7,
        }
        super(config)
        this.className = 'BlueKiBullet'
    }
}

export class RapidBlastBullet extends Bullet{
    constructor(){
        let config = {
            scene: game.scene.scenes[1],
            key: 'rapidBlast',
            sensor: true,
            isCircle: true,
            colliderSize: 0.7,
        }
        super(config)
        this.className = 'RapidBlastBullet'
    }
}

export class Arrow extends Bullet{
    constructor(){
        let config = {
            scene: game.scene.scenes[1],
            key: 'arrow',
            sensor: true,
            isCircle: true,
            colliderSize: 0.7,
        }
        super(config)
        this.className = 'Arrow'
    }
}

export class WizardAoEBullet extends Bullet{
    constructor(){
        let config = {
            scene: game.scene.scenes[1],
            key: 'aoeBullet',
            sensor: true,
            isCircle: true,
            colliderSize: 0.7,
        }
        super(config)
        this.className = 'WizardAoEBullet'
        this.setScale(1.5) //the graphic is a little small
    }
}

function SpawnMoneyAt(x, y, value){
    if(socket.id != authority) return //authority needs to spawn it so that the correct spriteId can be incremented and assigned to every instance of this same money object
        //at least thats my current vague understanding. we want the spriteIds to match thats for sure
    let m = new Money()
    m.setPosition(x,y)
    m.moneyValue = value
    let scale = Math.pow(value, 0.38) * m.moneyScale
    m.setScale(scale)
    NetSpawn(m.className, m.spriteId, m.x, m.y, m.angle, m.scaleX)
    setTimeout(function(){
        if(!m) return
        m.Destroy(true)
    }, 30 * 1000)
}

export function SpawnTreasureBagAt(x, y, value){
    if(socket.id != authority) return //authority needs to spawn it so that the correct spriteId can be incremented and assigned to every instance of this same money object
        //at least thats my current vague understanding. we want the spriteIds to match thats for sure
    let m = new TreasureBag()
    m.setPosition(x,y)
    m.moneyValue = value
    let scale = Math.pow(value, 0.38) * m.moneyScale
    m.setScale(scale)
    NetSpawn(m.className, m.spriteId, m.x, m.y, m.angle, m.scaleX)
    return m
}

var treasureBag = null //the current treasure bag on the map if there is any

setInterval(function(){
    if(!player) return //theyre not in the main scene yet
    if(socket.id != authority) return
    if(!treasureBag){
        let x = Phaser.Math.RND.between(500, game.scene.scenes[1].worldBoundsX - 500)
        let y = Phaser.Math.RND.between(500, game.scene.scenes[1].worldBoundsY - 500)
        let value = 100
        let bag = SpawnTreasureBagAt(x, y, value)
        treasureBag = bag
        setTimeout(function(){
            if(bag == treasureBag) treasureBag = null
            if(bag) bag.Destroy(true)
        }, 60 * 1000)
    }
}, 60 * 1000)

export class TreasureBag extends Sprite{
    constructor(){
        let config = {
            scene: game.scene.scenes[1],
            key: 'treasureBag',
            sensor: true,
            isCircle: true,
            colliderSize: 0.35,
        }
        super(config)
        let self = this
        this.className = 'TreasureBag'
        this.setSensor(true)
        this.moneyScale = 0.35
        this.setScale(this.moneyScale)
        this.moneyValue = 100
        this.netvars.angUpdate.disabled = true //it has its own spin, syncing it would interfere with it and make it look choppy. two contradicting spins
        this.netvars.scaleUpdate.disabled = true //it sends its initial scale using NetSpawn() function and its not expected to change scale after that, so it does not need to sync scale
        AddToRadar(this, 'radarDotYellow', 1)
        HelpPopup('Treasure Bag spawned (yellow radar dot)', 3000)
        
        //* you are seeing this right, money isnt networked 'perse' it just deletes when any player object crosses it and assumes someone got it somewhere even if it wasnt you
        this.collisionDelegates.push(function(other){
            let s = other.gameObject
            if(!s || !s.isAPlayer) return
            if(s === player){
                s.AddMoney(self.moneyValue)
            }
            if(treasureBag == self) treasureBag = null
            self.Destroy(true)
        })

        this.destroyDelegates.push(function(){
            if(treasureBag == self) treasureBag = null
            RemoveFromRadar(self)
        })
    }
}

export class Money extends Sprite{
    constructor(){
        let config = {
            scene: game.scene.scenes[1],
            key: 'blueCrystal',
            sensor: true,
            isCircle: true,
            colliderSize: 0.35,
        }
        super(config)
        let self = this
        this.className = 'Money'
        this.setSensor(true)
        this.moneyScale = 0.5
        this.setScale(this.moneyScale)
        this.moneyValue = 1
        this.moneySpin = Phaser.Math.RND.between(140, 220)
        if(Math.random() < 0.5) this.moneySpin = -this.moneySpin
        this.netvars.angUpdate.disabled = true //it has its own spin, syncing it would interfere with it and make it look choppy. two contradicting spins
        this.netvars.scaleUpdate.disabled = true //it sends its initial scale using NetSpawn() function and its not expected to change scale after that, so it does not need to sync scale
        
        this.updateDelegates.push(this.MoneySpin)
        
        //* you are seeing this right, money isnt networked 'perse' it just deletes when any player object crosses it and assumes someone got it somewhere even if it wasnt you
        this.collisionDelegates.push(function(other){
            let s = other.gameObject
            if(!s || !s.isAPlayer) return
            if(s === player){
                s.AddMoney(self.moneyValue)
            }
            self.Destroy(true)
        })
    }

    MoneySpin(){
        this.setAngle(this.angle + this.moneySpin * this.deltaTime)
    }
}

//* if this isnt at the bottom it doesnt work for some reason. all values will be null instead of the class prototype
export var spawnableClasses = {
    Wolf: Wolf,
    Deer: Deer,
    Boar: Boar,
    Rabbit: Rabbit,
    Chicken: Chicken,
    Lizard: Lizard,
    Rat: Rat,
    Zombie: Zombie,
    MeleeBullet: MeleeBullet,
    BlueKiBullet: BlueKiBullet,
    RapidBlastBullet: RapidBlastBullet,
    WizardAoEBullet: WizardAoEBullet,
    SwordBullet: SwordBullet,
    Arrow: Arrow,
    Money: Money,
    TreasureBag: TreasureBag,
}

//. these functions HAVE to be here because of the problem where we can not mix es6 import/export with require/module.exports. we tried to put it in clientUtils at first, but it just could not access the spawnableClasses var that it needs to work, so forget about it.
//* used for the authority to spawn a certain class of object over the network, associate the same spriteId issued by the server to it on all sides, and some basic starting info like position/angle/scale and then its treated as the same object across the network
//. if the class you try to spawn is not listed in spawnableClasses it wont work, so just add it to spawnableClasses
//* the process for using this is to create the sprite you want on the authority, set it up, then call NetSpawn and pass its spriteId and stuff as the parameters to NetSpawn which will then make a copy of it on all other sides
export function NetSpawn(className, spriteId, x, y, angle, scale){
    if(socket.id != authority) return
    let data = [ClassNameToClassIndex(className), spriteId, Math.round(x), Math.round(y), utils.CompressAngle(angle), utils.CompressFloat(scale)]
    socket.emit(utils.msg().netSpawn, data)
}

export function ClassNameToClassIndex(className){
    let index = 0
    for(let key in spawnableClasses){
        if(key.toString() === className) return index
        index++
    }
}

export function ClassIndexToClassName(classIndex){
    let index = 0
    for(let key in spawnableClasses){
        if(index === classIndex) return key
        index++
    }
}
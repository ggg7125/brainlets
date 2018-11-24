/*
Steps to make a new ability:
    make bullet class
    register bullet class in spawnableClasses
    register bullet graphic key in spritekeytoid (clientutils)
    register ability overlay graphic in spritekeytoid
    make ability class
    put instance of ability class in 'allAbilities' list
    add to msg() utils.msg().abilityName
    create socket.on for server
    create socket.on for client
    make platform for weapon - place it on map
*/

import { socket } from "./client"
import { player } from "./sceneTest";
import { GetBullet } from "./bullets";
import { game } from ".";
var utils = require('../utils')
var clientUtils = require('./clientUtils')

//i had to put this here because i cant put it in clientUtils because you cant mix import/export and module.exports in the same script and i need access to the 'game' instance which would require me to use import but i cant do that in clientUtils because it is a module.exports script - too bad i didnt know this to begin with
//. okay but now we have the clientUtilsES6.js file that we can move it to
export function PlaySfx(tag){
    for(let i in game.scene.scenes[1].sound.sounds){
        let sfx = game.scene.scenes[1].sound.sounds[i]
        if(sfx.key === tag){
            sfx.play()
            return
        }
    }
}

//. 'Start' function
setTimeout(function(){
    allAbilities = [new Melee(), new Shield(), new Blast(), new RapidBlast(), new Bow(), new WizardAoE(), new Sword()]
}, 0)

export function GiveDefaultAbilities(){
    EquipAbility(utils.msg().abilityMelee, 0)
    EquipAbility(utils.msg().abilityBow, 1)
    //EquipAbility(utils.msg().abilityShield, 1)
}

var allAbilities
export var lmb //the ability class you have equipped on lmb
export var rmb //and rmb
export var cooldowns = {}

export function EquipAbility(abilityCode, button){
    if(button === undefined) button = 0 //lmb
    let a = FindAbilityByCode(abilityCode)
    if(button == 0){
        if(lmb && lmb.weaponOverlay) player.RemoveOverlay(lmb.weaponOverlay)
        if(a.weaponOverlay) player.AddOverlay(a.weaponOverlay)
        lmb = a
    }
    if(button == 1) rmb = a
}

export function FindAbilityByCode(abilityCode){
    for(let i in allAbilities){
        let a = allAbilities[i]
        if(a.abilityCode == abilityCode) return a
    }
}

export function DoAbilityByCode(code, sprite, angle){
    for(let i in allAbilities){
        let a = allAbilities[i]
        if(a.abilityCode != code) continue
        a.DoAbility(sprite, angle)
        break
    }
}

//not even relevent for one-off abilities. only sustained abilities or toggle on/off abilities need told to 'stop' (are those the same thing? idk).
export function StopAbilityByCode(code, sprite){
    for(let i in allAbilities){
        let a = allAbilities[i]
        if(a.abilityCode != code) continue
        a.StopAbility(sprite)
        break
    }
}

//. i did not test if we need setTimeout() for this. im just pre-emptively assuming.
//* dont forget when making new attacks the server needs a listener for the abilityCode and so does any client receiving it. here, and in server.js
//! IS SHIELD NOT WORKING PROPERLY BECAUSE WE DONT HAVE A LISTENER HERE AND IN SERVER.JS FOR IT? IDK IF IT USES THIS SAME SYSTEM
setTimeout(function(){
    socket.on(utils.msg().abilityMelee, function(data){
        let code = utils.msg().abilityMelee //. make sure this matches the one above!!
        BulletAbilityListener(code, data)
    })
    socket.on(utils.msg().abilityBlast, function(data){
        let code = utils.msg().abilityBlast //. make sure this matches the one above!!
        BulletAbilityListener(code, data)
    })
    socket.on(utils.msg().abilityRapidBlast, function(data){
        let code = utils.msg().abilityRapidBlast //. make sure this matches the one above!!
        BulletAbilityListener(code, data)
    })
    socket.on(utils.msg().abilityBow, function(data){
        let code = utils.msg().abilityBow //. make sure this matches the one above!!
        BulletAbilityListener(code, data)
    })
    socket.on(utils.msg().abilityWizardAoE, function(data){
        let code = utils.msg().abilityWizardAoE //. make sure this matches the one above!!
        BulletAbilityListener(code, data)
    })
    socket.on(utils.msg().abilitySword, function(data){
        let code = utils.msg().abilitySword //. make sure this matches the one above!!
        BulletAbilityListener(code, data)
    })
}, 10)

function BulletAbilityListener(code, data){
    if(Array.isArray(data)){
        let playerSlot = data[0]
        let angle = utils.DecompressAngle(data[1]) //even a slight angle deviation is extremely noticeable especially over enough distance so we explicitly sent an angle
        let s = clientUtils.GetPlayerBySlot(playerSlot)
        if(!s) return
        DoAbilityByCode(code, s, angle)
    }
    //* if its not an array we have merely been told to stop performing this ability
    else{
        let playerSlot = data
        let s = clientUtils.GetPlayerBySlot(playerSlot)
        if(!s) return
        StopAbilityByCode(code, s)
    }
}

export class Ability{
    constructor(){
        this.abilityCode = null //utils.msg().abilityMelee etc
        this.useStopAbility = false //most abilities are one-offs, they dont need told to stop. thats for like toggled on/off / sustained abilities.
        this.cooldown = 1000
        this.globalCooldown = 1000
        this.obeyGlobalCooldown = true
        this.cooldownOnStop = 0
        this.globalCooldownOnStop = 0
        this.sfx = 'meleeSound'
        this.weaponOverlay = 'hatchet'
        this.stamDrain = 10
        this.bulletSpin = 0 //negative or positive = spin the other way
    }

    StopAbility(sprite){
        if(!this.CanStopAbility(sprite)) return false
        if(sprite == player) socket.emit(this.abilityCode)
        let onstop = true
        this.TriggerCooldown(sprite, onstop)
        if(sprite == player) this.inUse = false
        return true
    }

    CanStopAbility(sprite){
        if(!this.useStopAbility || !this.inUse) return false
        return true
    }

    TryAbility(){
        if(!this.CanPerform()) return false
        this.DoAbility(player, this.AbilityAngle())
        return true
    }

    CanPerform(){
        if(this.inUse) return
        if(this.obeyGlobalCooldown && cooldowns.globalCooldown && Date.now() < cooldowns.globalCooldown.nextUse) return false
        if(cooldowns[`ability${this.abilityCode}`] && Date.now() < cooldowns[`ability${this.abilityCode}`].nextUse) return false
        if(player.shielding || player.stunned) return false
        if(player.stamina < this.StamDrainFor(player)) return false
        return true
    }

    AbilityAngle(){
        let angle = player.angle
        if(this.randomAngle){
            let randomAngle = Math.random() * this.randomAngle
            if(Math.random() < 0.5) randomAngle = -randomAngle
            angle += randomAngle
        }
        return angle
    }

    StamDrainFor(sprite){
        return this.stamDrain * sprite.StamDrainMult()
    }

    DoAbility(sprite, angle){
        if(sprite == player){
            //* this is how bullets are networked. a predetermined position and direction are send to everyone and it puts the bullet there and sends it in that direction
            //. bullets do NOT use netvars as of writing this, so if you are wondering how they still move on everyone's screen at once, here it is. they arent sending out position updates.
            socket.emit(this.abilityCode, utils.CompressAngle(angle))
        }
        this.TriggerCooldown(sprite)
        if(this.sfx) PlaySfx(this.sfx)
        if(sprite == player){
            if(this.useStopAbility) this.inUse = true
            sprite.AddStam(-this.StamDrainFor(sprite))
        }
        sprite.lastAbilityUse = Date.now()
        return true
    }

    TriggerCooldown(sprite, onstop){
        if(sprite != player) return
        let aName = `ability${this.abilityCode}`
        cooldowns[aName] = {lastUse: Date.now(), nextUse: Date.now() + this.SelfCooldown()}
        cooldowns.globalCooldown = {lastUse: Date.now(), nextUse: Date.now() + this.GlobalCooldown()}
        if(onstop){
            if(this.cooldownOnStop && cooldowns[aName].nextUse < Date.now() + this.CooldownOnStop()){
                cooldowns[aName].nextUse = Date.now() + this.CooldownOnStop()
            }
            if(this.globalCooldownOnStop && cooldowns.globalCooldown.nextUse < Date.now() + this.globalCooldownOnStop()){
                cooldowns.globalCooldown.nextUse = Date.now() + this.globalCooldownOnStop()
            }
        }
    }

    SelfCooldown(){
        return this.cooldown * player.CooldownMult()
    }

    GlobalCooldown(){
        return this.globalCooldown * player.CooldownMult()
    }

    CooldownOnStop(){
        return this.cooldownOnStop * player.CooldownMult()
    }

    GlobalCooldownOnStop(){
        return this.globalCooldownOnStop * player.CooldownMult()
    }

    //whether this sprite already has the weapon's overlay on them or not
    HasWeaponOverlay(sprite){
        for(let o of sprite.overlays){
            if(o.spriteKey == this.weaponOverlay) return true
        }
        return false
    }
}

//attack types: projectile. guided. aoe. beam.
export class Attack extends Ability{
    constructor(){
        super()
        this.percentDamage = 20
    }
}

export class BulletAttack extends Attack{
    constructor(){
        super()
        this.bulletClass = 'MeleeBullet' //* if the class of this name isnt registered in spawnableClasses{} it wont work
        this.bulletVelocity = 23
        this.bulletTimeout = 105 //the bullet deletes itself after this many ms
        this.randomAngle = 0
        this.bulletExplosionSize = 0
        this.explodeOnDelete = true
        this.multiBullet = null //for multiBullets, turn this into a list, each entry representing the angle deviation from the base angle we were sent for the multiple projectiles to follow, for example multiBullet = [0, 30, -30] means 3 bullets fire at once, one straight down the line (0 deviation) and the other two at 30 and -30 degrees away from being straight down the line
    }

    DoAbility(sprite, angle){
        super.DoAbility(sprite, angle)
        if(!this.multiBullet) this.FireBullet(sprite, angle)
        else{
            for(let deviation of this.multiBullet){
                this.FireBullet(sprite, angle + deviation)
            }
        }
    }

    FireBullet(sprite, angle){
        let b = GetBullet(this.bulletClass)
        b.bulletTimeout = this.bulletTimeout * sprite.BulletTimeoutMult()
        b.percentDamage = this.percentDamage * sprite.DmgMult()
        let radian = Phaser.Math.DegToRad(angle)
        b.rotation = radian
        let xOffset = Math.cos(radian) * 35 //we offset the bullet forward some because it looks bad spawning at the exact origin of the character
        let yOffset = Math.sin(radian) * 35
        clientUtils.SetPosition(b, sprite.x + xOffset, sprite.y + yOffset)
        b.bulletVelocity = this.bulletVelocity
        b.bulletAngle = b.rotation //angle of travel - radians
        b.bulletOwner = sprite
        b.bulletXpMod = this.BulletXpMod()
        b.bulletSpin = this.bulletSpin
        b.bulletExplosionSize = this.bulletExplosionSize
        b.explodeOnDelete = this.explodeOnDelete
    }

    BulletXpMod(){
        let mod = 1
        mod *= this.SelfCooldown() / 1000 //relativize xp given by rate of fire
        if(this.multiBullet) mod /= this.multiBullet.length //each bullet gives xp so lower the xp per bullet by the amount of bullets
        return mod
    }
}

export class GuidedAttack extends Attack{} //. not sure what this should extend yet
export class AoEAttack extends Attack{}
export class Beam extends Attack{} //. not sure what this should extend yet
export class PassiveAbility extends Ability{}
export class Buff extends Ability{}

//. now we define abilities the player can actually use - all the ones defined before were parent classes providing core functionality
export class Melee extends BulletAttack{
    //. this is called 'Melee' but really it is the Hatchet. its just the first melee attack we created and now its not worth to change the name
    constructor(){
        super()
        this.abilityCode = utils.msg().abilityMelee
        this.percentDamage = 26
        this.bulletVelocity = 23
        this.bulletTimeout = 105
        this.stamDrain = 10
        this.cooldown = 1000
        this.globalCooldown = 1000
        this.obeyGlobalCooldown = true
        this.cooldownOnStop = 0
        this.globalCooldownOnStop = 0
    }

    DoAbility(sprite, angle){
        super.DoAbility(sprite, angle)
    }
}

export class Sword extends BulletAttack{
    constructor(){
        super()
        this.abilityCode = utils.msg().abilitySword
        this.percentDamage = 20
        this.bulletClass = 'SwordBullet'
        this.weaponOverlay = 'sword'
        this.bulletTimeout = 145
        this.bulletVelocity = 24
        this.stamDrain = 8
        this.sfx = 'swordSfx'
        this.cooldown = 720
        this.globalCooldown = 720
        this.obeyGlobalCooldown = true
        this.cooldownOnStop = 0
        this.globalCooldownOnStop = 0
    }

    DoAbility(sprite, angle){
        super.DoAbility(sprite, angle)
    }
}

export class Blast extends BulletAttack{
    constructor(){
        super()
        this.abilityCode = utils.msg().abilityBlast
        this.bulletClass = 'BlueKiBullet'
        this.weaponOverlay = 'staff'
        this.bulletTimeout = 1500
        this.bulletVelocity = 13
        this.stamDrain = 12
        this.bulletSpin = -1.3 //each integer is a full 360 degree rotation per second
        this.sfx = 'blastSfx'
        this.bulletExplosionSize = 4.2
    }
}

export class RapidBlast extends BulletAttack{
    constructor(){
        super()
        this.abilityCode = utils.msg().abilityRapidBlast
        this.bulletClass = 'RapidBlastBullet'
        this.weaponOverlay = 'staff'
        this.percentDamage = 8.5
        this.bulletTimeout = 650
        this.bulletVelocity = 23
        this.stamDrain = 6
        this.cooldown = 600
        this.globalCooldown = 600
        this.bulletSpin = 0 //each integer is a full 360 degree rotation per second
        this.randomAngle = 8
        this.sfx = 'blastSfx'
    }
}

export class Bow extends BulletAttack{
    constructor(){
        super()
        this.abilityCode = utils.msg().abilityBow
        this.bulletClass = 'Arrow'
        this.weaponOverlay = 'bow'
        this.percentDamage = 8
        this.bulletTimeout = 900
        this.bulletVelocity = 32
        this.stamDrain = 16
        this.bulletSpin = 0 //each integer is a full 360 degree rotation per second
        this.sfx = 'bowSfx'
        this.bulletExplosionSize = 0
        this.multiBullet = [0, 6, -6]
        this.cooldown = 1800
        this.globalCooldown = 1800
    }
}

export class WizardAoE extends BulletAttack{
    constructor(){
        super()
        this.abilityCode = utils.msg().abilityWizardAoE
        this.bulletClass = 'WizardAoEBullet'
        this.weaponOverlay = 'staff'
        this.percentDamage = 15
        this.bulletTimeout = 200
        this.bulletVelocity = 19
        this.stamDrain = 11
        this.bulletSpin = 0 //each integer is a full 360 degree rotation per second
        this.sfx = 'blastSfx'
        this.bulletExplosionSize = 3.5
        this.multiBullet = [0, 60, 120, 180, 240, 300]
        this.cooldown = 1400
        this.globalCooldown = 1400
        this.explodeOnDelete = false //just doesnt look right otherwise
    }
}

export class Shield extends Ability{
    constructor(){
        super()
        this.abilityCode = utils.msg().abilityShield
        this.useStopAbility = true
        this.cooldown = 150
        this.globalCooldown = 0
        this.obeyGlobalCooldown = false
        this.cooldownOnStop = 150
        this.stamDrain = 0
        this.weaponOverlay = null
        this.sfx = null
    }

    CanPerform(){
        if(player.shieldBroken) return false
        return super.CanPerform()
    }

    DoAbility(sprite, angle){
        super.DoAbility(sprite, angle)
        let overlay = sprite.AddOverlay('shield')
        if(overlay){ //if the overlay is already on you, it wont put another instance of the same overlay on you, so it returns nothing
            overlay.isShieldOverlay = true
        }
        sprite.lastShieldOn = Date.now()
        sprite.shielding = 1 //we use 1 & 0 instead of true & false because we are sending this over the network apparently now
    }

    StopAbility(sprite){
        if(!this.CanStopAbility(sprite)) return
        super.StopAbility(sprite)
        sprite.RemoveOverlay('shield')
        sprite.lastShieldOff = Date.now()
        sprite.shielding = 0
        return true
    }
}
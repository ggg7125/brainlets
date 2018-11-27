import { socket, authority } from "./client";
import { PowerGem, NetSpawn, NetSpawnFor } from "./classes";
import { AddToRadar, RemoveFromRadar } from "./radar";
import { player } from "./sceneTest";
import { NetTeleport, InWorldBounds, SendToRandomMapPosition } from "./clientUtilsES6";
const utils = require('../utils')
const clientUtils = require('./clientUtils')

export var gemHolder //who currently has the gem
export var powerGem //the current instance of the power gem class - the PowerGem class constructor will set the value of this - there can only ever be one
export var gemDmgIncrease = 2
export var gemDmgDecrease = 0.5

//this happens on the "first authority" to ever connect to a game, to initialize the existance of the power gem
export function InitPowerGem(){
    let gem = new PowerGem()
    gem.setPosition(8500,7500)
    NetSpawn(gem.className, gem.spriteId, gem.x, gem.y, gem.angle, gem.scale) //spawn this gem for all currently online players
}

//this function only exists because ES6 is giving us problems directly setting gemHolder var to some value from other scripts, it only lets us do it through a function like this idk why
export function SetPowerGem(s){
    powerGem = s
}

//this loop will ensure that if the power gem somehow ceases to exist a new one will be made - this is not something im aware of that happens, its just a precaution
setInterval(function(){
    if(socket.id == authority){
        if(!powerGem || !powerGem.body){
            InitPowerGem()
        }
        //if no one has the gem, but the gem is somehow out of bounds, and we are the authority, something has gone wrong and we need to just put the gem back on the map
        if(!gemHolder && socket.id == authority){
            if(!InWorldBounds(powerGem.x, powerGem.y)){
                SendToRandomMapPosition(powerGem)
            }
        }
    }
}, 1000)

//this happens when the player collides with the power gem - they then request to have it from the authority if currently allowed - aka no one else already has it
export function PlayerCrossedPowerGem(s){
    if(s != player) return
    socket.emit(utils.msg().tryGetPowerGem) //request to have the power gem, request will be denied if someone already has it on the authority
    //. if the authority approves, then it calls NetAssignGemHolder() next, so look there for continuance
}

//the authority assigns the new gem holder then tells everyone else to do the same
export function NetAssignGemHolder(sprite){
    if(socket.id != authority) return
    if(sprite.isAPlayer != true) return //just in case
    NetTeleport(powerGem, -1000, -1000) //only need to teleport from authority side - which this is
    LocalAssignGemHolder(sprite)
    socket.emit(utils.msg().assignGemHolder, sprite.playerSlot) //authority broadcasts to everyone else to do the same
}

//everyone runs this function locally in response to the authority telling them they should run it
export function LocalAssignGemHolder(sprite){
    if(gemHolder) gemHolder.LocalRemovePowerGemFrom(gemHolder)
    let skipAuthorityCheck = false //idk what this should be yet
    sprite.AddOverlay('yellowRadialCircle', 5, false, skipAuthorityCheck, 2) //the scale we put here actually doesnt matter - that param of the function doesnt do anything anymore - it deduces how big it should be based on which overlay we are adding now so that it doesnt have to send network data of what the size is
    //. add stats to them
    gemHolder = sprite
    //clientUtils.SetPosition(powerGem, -1000, -1000) //its implied that they got this gem by touching it, so send it to the void to represent that they now "have" it, so its not on the map
    if(sprite != player) AddToRadar(sprite, 'redRadarDot', 0.75)
    //RemoveFromRadar(powerGem) //* we no longer need to remove the gem from the radar, because the radar will now not display dots outside the map bounds, so that solves it for us by putting the gem outside the map
}

//this is when the player dies we check if they have the gem - if so they drop it
export function DropPowerGemCheck(s){
    if(s != gemHolder || socket.id != authority) return
    //since this can only run on the authority, merely changing the gem's position should be enough for netvars to pick up the change and send it out to everyone
    NetRemovePowerGemFrom(s)
    //powerGem.setPosition(s.x, s.y)
    NetTeleport(powerGem, s.x, s.y)
}

//the authority tells the gem holder to be removed then tells everyone else to do the same
export function NetRemovePowerGemFrom(sprite){
    if(socket.id != authority || sprite != gemHolder) return
    LocalRemovePowerGemFrom(sprite)
    socket.emit(utils.msg().removePowerGemFrom, sprite.playerSlot)
}

//everyone runs this function to locally remove the gem from someone - someone who the authority informed them they should remove it from
export function LocalRemovePowerGemFrom(sprite){
    if(sprite != gemHolder) return
    let skipAuthorityCheck = false //idk what this should be yet so i just put false
    sprite.RemoveOverlay('yellowRadialCircle', skipAuthorityCheck)
    //. remove the gem stats from them - possibly only if authority
    gemHolder = null
    if(sprite != player) RemoveFromRadar(sprite)
}

//this function runs when the person who has the gem has left the game
export function GemHolderLeftGameCheck(sprite){
    if(socket.id != authority || !HasPowerGem(sprite)) return
    NetTeleport(powerGem, 8500, 7500) //seems all we need to do if someone exits the game with the gem is put the gem back on the map - its all good from there
}

//this is used in other places of the code to give the perks of the gem - such as healing faster and doing more damage is HasGemPower() == true
export function HasPowerGem(sprite){
    if(sprite && gemHolder == sprite) return true
    return false
}

//setTimeout is proven necessary we tried here without it
setTimeout(function(){
    //this happens on the authority when they receive a request from someone who is trying to get the power gem - the authority will then determine if this request is authorized
    socket.on(utils.msg().tryGetPowerGem, function(data){
        if(socket.id != authority) return
        if(gemHolder) return //someone already has it - by not responding that they are permitted to possess it, is the same as denying it
        let playerSlot = data
        let p = clientUtils.GetPlayerBySlot(playerSlot)
        if(!p) return
        NetAssignGemHolder(p)
    })

    //this is us receiving a message from the authority commanding us to change the gem holder to a new person
    socket.on(utils.msg().assignGemHolder, function(data){
        let playerSlot = data
        let p = clientUtils.GetPlayerBySlot(playerSlot)
        if(!p) return
        LocalAssignGemHolder(p)
    })

    //this is a message everyone gets from the authority when the person holding the power gem is killed on the authority - the authority sends out a message that it should be removed from them on all sides
    socket.on(utils.msg().removePowerGemFrom, function(data){
        let playerSlot = data
        let p = clientUtils.GetPlayerBySlot(playerSlot)
        if(!p) return
        LocalRemovePowerGemFrom(p)
    })

    //this is a message the authority gets when a new player has joined the room and the server has asked the authority to send this new player the power gem data so we now send all relevent power gem data to them - so it can appear on their screen and radar and such
    socket.on(utils.msg().requestPowerGemData, function(data){
        let playerSlot = data //the player who wants the gem data
        //console.log(`playerSlot ${playerSlot} requested power gem to be spawned for them`)
        NetSpawnFor(playerSlot, powerGem) //make the powerGem object exist for them on their side
        if(gemHolder){
            let newData = [playerSlot, gemHolder.playerSlot]
            socket.emit(utils.msg().givePowerGemData, newData) //we send the player the data they need to know about the power gem
        }
    })

    //this is a message a new player who just joined gets from the authority to inform us all that we need to know about the current state of the power gem and who has it
    socket.on(utils.msg().givePowerGemData, function(data){
        let gemHolderSlot = data
        let sprite = clientUtils.GetPlayerBySlot(gemHolderSlot)
        if(!sprite) return
        LocalAssignGemHolder(sprite)
    })
}, 10)
/*
what every client gets to send to the relay server:
    their own position etc
what only the authority gets the send to the relay server:
    npc position etc
    position etc of inanimate objects like ones being pushed
*/

import 'phaser'
import {SetPlayer, GetPlayer, player} from './sceneTest'
import {Player, RemotePlayer, SetSpriteId, NewSpriteId, spawnableClasses, ClassIndexToClassName} from './classes'
import {game} from './index'
import {CreateEnemy, GetAllNPCs, GetEnemySendableData, SpawnEnemyFromData} from './npcs'
import {nameFieldValue, AddFloatingNameTo, ShowOverheadMessage} from './ui'
import { GiveDefaultAbilities, StopAbilityByCode } from './abilityCore';
import { allHats } from './hats';
import { AddToRadar } from './radar';
import { LocalExplosion } from './clientUtilsES6';
var utils = require('../utils')
var clientUtils = require('./clientUtils')

var socketConfig = {
    'reconnection': false,
}

export var socket = io(socketConfig) //this just means connect to whatever host is already serving the website, instead of io.connect('address:port')
//export var socket = io.connect('https://localhost:8888', socketConfig)
//export var socket = io.connect('https://45.77.148.227:8888', socketConfig) //. with this example you use the precise vps ip, game portals will require this.

socket.emit('joinRoom', 'Title Screen') //tells the server this client needs to join that room, socket.join() is not even a function client side
socket.emit('gameVersion', utils.GameVersion()) //tell the server our version, if it doesnt match the server kicks us

export var authority //which socket.id is the current authority on the world, if it isnt you then there are a lot of things you cant tell the relay server what to do. but still some you do, for example your own character's position and rotation updates you must still send
export var authorityHashId
export var authoritySlot //the authority's player slot, we mostly need this when we include the authority in 'SendInRange' since it uses their playerSlot as a receiver id

export var remotePlayers = [] //contains RemotePlayer classes

//* this is meant to be used only by the authority because the authority knows the position of everything and they decide who is close enough to be considered 'in range'
//. the room is implied because the authority is clearly in the same room as any other sockets it is trying to send to
// inclusions is an array of hashIds
export function SendInRange(o, range, tag, data, excludeSender, inclusions){
    //if(socket.id != authority) return
    let receivers = []
    if(!excludeSender) receivers.push(socket.playerSlot)
    //* we converted sendinrange to use playerSlot because the advantage of using playerSlots instead of hashIds is that playerSlot is 1 byte and hashId is 4 bytes
    for(let i in remotePlayers){ //remotePlayers never contains whoever this local socket is
        let r = remotePlayers[i]
        if(Phaser.Math.Distance.Between(o.x, o.y, r.x, r.y) <= range){
            receivers.push(r.playerSlot)
        }
    }
    if(inclusions){
        for(let i2 in inclusions){
            let playerSlot = inclusions[i2]
            if(receivers.includes(playerSlot)) continue
            if(excludeSender && playerSlot == socket.playerSlot) continue //. pretty sure excluding them is the right thing to do here
            receivers.push(playerSlot)
        }
    }
    if(receivers.length == 0) return
    let newData = [receivers, tag, data]
    socket.emit(utils.msg().sendInRange, newData) //send it to the relay server to handle it from there
}

//. netvar reciever
socket.on(utils.msg().netvar, function(data){
    let spriteId
    let varIndex
    let value
    //if no id was sent this message is implied to be specifically for our player sprite
    //. we are deducing by the lengths of the messages whether is a 'range', 'everyone', 'player', etc message currently.
    if(data.length == 2){
        varIndex = data[0]
        value = data[1]
    }
    //an id was sent, so we know this message is for a sprite of that id
    if(data.length == 3){
        spriteId = data[0]
        varIndex = data[1]
        value = data[2]
    }
    let sprite
    if(spriteId) sprite = clientUtils.GetSpriteBySpriteId(spriteId)
    else sprite = player
    
    if(!sprite || !sprite.useNetvars) return
    
    let varKey = Object.keys(sprite.netvars)[varIndex]
    let netVar = sprite.netvars[varKey]
    
    if(sprite.OwnsNetvar(netVar)) return //we are the ones who send this var out, if we get orders to change it we want to ignore it, as we are in charge of the value
    
    let previousValue = netVar.value
    netVar.value = value
    netVar = clientUtils.NetVarDecompress(netVar) //note this returns a copy of the netvar, not a direct reference
    netVar.receiveTime = Date.now()
    sprite.netvars[varKey] = netVar //and thats why we reassign it here.
    sprite[varKey] = netVar.value //* the sprite's var now matches the same value as the netvar of the same name
    //console.log(`received netvar ${varKey}, varIndex ${varIndex} for ${sprite.className} ${sprite.spriteId}, value ${netVar.value}`)

    //. some netvars require special handling when received, for example if we receive an array of overlayIds, we cant do anything with it directly so we must convert it to something we can use and then also actually use it
    sprite.NetvarReceiverSpecialHandling(varKey, netVar, previousValue)
})

//if you got the storedData from the server, you were sent it because you are the new authority now, and you will use the storedData to continue updating the game where the last authority left off
socket.on(utils.msg().storedData, function(data){
    console.log('WE BECAME NEW AUTHORITY. storedData RECEIVED:')
    console.log(data)
    let nonexistantSpriteIds = []
    let nonexistantplayerSlots = []
    //helper: storedData[roomId][category][id.toString()][varIndex.toString()] = value
    let spriteIds = data['spriteIds'] //a dictionary of spriteIds, which contains a dictionary of variables with values for the sprite with that spriteId
    for(let i in spriteIds){
        let spriteId = i
        let sprite = clientUtils.GetSpriteBySpriteId(spriteId)
        if(sprite){
            let spriteVars = spriteIds[i]
            for(let v in spriteVars){
                let varIndex = v
                let value = spriteVars[v]

                let netVar = sprite.netvars[Object.keys(sprite.netvars)[varIndex]]
                netVar.value = value
                netVar = clientUtils.NetVarDecompress(netVar) //* always remember the values in storedData are compressed and must always be decompressed to be assigned to a sprite
                sprite.netvars[Object.keys(sprite.netvars)[varIndex]] = netVar //because NetVarDecompress returns a COPY not a reference

                //now we also make all the vars directly on the sprite who have the same name as a netvar match the netvar value above
                for(let key in sprite.netvars){
                    sprite[key] = sprite.netvars[key].value
                }
            }
        }
        else nonexistantSpriteIds.push(spriteId)
    }
    let playerSlots = data['playerSlots'] //same as above but with playerSlots - pretty sure these are always the playerSlot of a player, never an npc
    for(let i in playerSlots){
        let playerSlot = i
        let sprite = clientUtils.GetPlayerBySlot(playerSlot) //. notice its Get PLAYER. because we are assuming if its a playerSlot then its for a player
        if(sprite){
            let spriteVars = playerSlots[i]
            for(let v in spriteVars){
                let varIndex = v
                let value = spriteVars[v]
                
                let netVar = sprite.netvars[Object.keys(sprite.netvars)[varIndex]]
                netVar.value = value
                netVar = clientUtils.NetVarDecompress(netVar) //* always remember the values in storedData are compressed and must always be decompressed to be assigned to a sprite
                sprite.netvars[Object.keys(sprite.netvars)[varIndex]] = netVar

                //now we also make all the vars directly on the sprite who have the same name as a netvar match the netvar value above
                for(let key in sprite.netvars){
                    sprite[key] = sprite.netvars[key].value
                }
            }
        }
        else nonexistantplayerSlots.push(playerSlot)
    }
    //nonexistant entities will be removed from the server's storedData now, because these entities were not found on the new authority. this means they were players who logged out, or npcs who were destroyed, or any sprite that was destroyed and no longer exists but still has a reference in the server's storedData
    socket.emit(utils.msg().removeNonexistantsFromStoredData, [nonexistantSpriteIds, nonexistantplayerSlots])
})

socket.on('connect', function(){
    socket.hashId = utils.HashCode(socket.id)
    socket.lastPong = 0
})

//you can't check client ping server side i looked into it and tried it already so oh well client only
socket.on('ping', function(){
    //console.log('we sent a ping to the server')
})

socket.on('pong', function(ms){
    //console.log(`pong from server: ${ms} ms`)
    socket.lastPong = ms
    //we want the server to know this info too, because it is not built in functionality in socket.io
    socket.emit(utils.msg().latencyUpdate, ms)
})

socket.on(utils.msg().destroySprite, function(data){
    let spriteId = data
    let sprite = clientUtils.GetSpriteBySpriteId(spriteId)
    if(!sprite) return
    let fromAuthority = true
    sprite.Destroy(fromAuthority)
})

socket.on(utils.msg().chatMessage, function(data){
    let spriteId = data[0]
    let sprite = clientUtils.GetEntityBySpriteId(spriteId)
    if(!sprite) return
    let msg = data[1]
    ShowOverheadMessage(sprite, msg)
})

socket.on(utils.msg().knockback, function(data){
    let spriteId = data[0]
    let sprite = clientUtils.GetEntityBySpriteId(spriteId)
    if(!sprite) return
    let dist = data[1]
    let radian = utils.DecompressAngleToRadian(data[2])
    let skipAuthorityCheck = true
    sprite.Knockback(dist, radian, skipAuthorityCheck)
})

socket.on('wrongVersion', function(){
    console.log('Wrong game version. Disconnecting.')
    socket.disconnect()
    document.getElementById('titleUI').hidden = true //hide the title UI so they cant click Play and such
    document.getElementById('wrongVersion').hidden = false
    //* add a button they can click to send them to the official website to play where it is more surely the correct version
})

socket.on('reconnect', function(attemptNumber){
    console.log(`reconnected successfully. attempt number ${attemptNumber}`)
})

socket.on('reconnect_attempt', function(attemptNumber){
    console.log(`attempt to reconnect #${attemptNumber}`)
})

socket.on(utils.msg().netSpawn, function(data){
    let classIndex = data[0]
    let spriteId = data[1]
    let x = data[2]
    let y = data[3]
    let radian = utils.DecompressAngleToRadian(data[4])
    let scale = utils.DecompressFloat(data[5])
    let className = ClassIndexToClassName(classIndex)
    let o = new spawnableClasses[className]()
    o.spriteId = SetSpriteId(spriteId)
    o.setPosition(x,y)
    o.setRotation(radian)
    o.setScale(scale)
})

//array[0] is the socketId, 1 is x, 2 is y
//this is a message of the server telling the client to spawn some other remote player into their scene who has connected to the game
socket.on('newRemotePlayer', function(data){
    let spriteId = data[0]
    let socketId = data[1]
    let x = data[2]
    let y = data[3]
    let spriteName = data[4]
    let playerSlot = data[5]
    //if !player, they are at the title screen, so ignore remote player spawnings or theyll spawn in the wrong scene and never appear. they get sent a list of historical players when they log in anyway so thats how theyll spawn past players that way
    if(GetPlayer()) AddRemotePlayerToScene(spriteId, socketId, x, y, spriteName, playerSlot)
})

socket.on('spawnPastPlayers', function(data){
    //'data' is an array of arrays, each array contains multiple values needed to reconstruct preexisting players for this newly joined player
    //data.push([s.id, s.spriteId, s.spriteName, s.playerSlot])
    for(let i = 0; i < data.length; i++){
        let a = data[i]
        let socketId = a[0]
        let spriteId = a[1]
        let spriteName = a[2]
        let playerSlot = a[3]
        let x = a[4]
        let y = a[5]
        let sprite = AddRemotePlayerToScene(spriteId, socketId, x, y, spriteName, playerSlot)
    }
})

socket.on('spawnPastNPCs', function(data){
    for(let i in data){
        SpawnEnemyFromData(data[i])
    }
})

socket.on('spawnEnemy', function(data){
    if(socket.id == authority) return //precautionary, the authority tells others to spawn the enemy not the other way around
    SpawnEnemyFromData(data)
})

socket.on('requestNpcList', function(data){
    let socketId = data[0]
    let roomId = data[1]
    let npcs = GetAllNPCs()
    let npcsData = []
    for(let i in npcs){
        npcsData.push(GetEnemySendableData(npcs[i]))
    }
    socket.emit('fullNpcList', [socketId, roomId, npcsData])
})

//* WARNING. this is not our socket being disconnected from the server. this is a message all clients get when any other client leaves the game.
socket.on('disconnecting', function(socketId){
    //. since whoever this is left, remove them from our side of the game
    for(let i = 0; i < remotePlayers.length; i++){
        var remotePlayer = remotePlayers[i]
        if(remotePlayer.socketId == socketId){
            remotePlayers = utils.remove(remotePlayers, remotePlayer)
            let fromAuthority = true //otherwise Destroy() will stop, thinking we dont have permission to destroy the player sprite
            remotePlayer.Destroy(fromAuthority) //this is our own function in the sprite class
        }
    }
})

//this happens when we specifically were disconnected from the server
socket.on('disconnect', function(reason){
    console.log('we were disconnected from the server')
    location.reload() //just refresh the page sending them back to the title screen
})

var testNPCsGenerated = false

//the server sends this to clients to tell them which socket.id is currently the authority on the world
socket.on('setAuthority', function(data){
    let socketId = data[0]
    let playerSlot = data[1]
    authority = socketId
    authoritySlot = playerSlot
    authorityHashId = utils.HashCode(authority)
    console.log(`authority changing to ${socketId}`)

    //. THIS DOES NOT GO HERE IT IS A TEST. IT CAUSES THE PROBLEM OF MANY NEW NPCS SPAWNING EVERY TIME THE AUTHORITY CHANGES
    if(!testNPCsGenerated){
        testNPCsGenerated = true
        for(let i = 0; i < 130; i++){
            let x = Phaser.Math.RND.between(500, game.scene.scenes[1].worldBoundsX - 500)
            let y = Phaser.Math.RND.between(500, game.scene.scenes[1].worldBoundsY - 500)
            if(utils.Distance(x, y, game.scene.scenes[1].worldBoundsX / 2, game.scene.scenes[1].worldBoundsY / 2) < 2000) continue
            let species = utils.Pick(['Wolf', 'Deer', 'Boar', 'Rabbit', 'Chicken', 'Lizard', 'Rat', 'Zombie'])
            //let species = 'Zombie'
            let enemy = CreateEnemy(species, x, y)
            if(!enemy) break //non-authority attempt to create enemy
        }
    }
})

socket.on(utils.msg().explosion, function(data){
    let x = data[0]
    let y = data[1]
    let size = data[2]
    LocalExplosion(x, y, size)
})

//this is a message the authority gets when the player is requesting to have a local player created for them
socket.on('askAuthorityToCreateLocalPlayer', function(data){
    if(socket.id != authority){
        console.log('BUG: askAuthorityToCreateLocalPlayer was asked on someone who is NOT the authority')
        return
    }
    let socketId = data[0]
    let playerName = data[1]
    socket.emit('tellClientToCreateLocalPlayer', [socketId, NewSpriteId(), playerName])
})

//* having finally gotten the permission and needed data from the authority to create the local player, we do
socket.on('tellClientToCreateLocalPlayer', function(data){
    let spriteId = data[0]
    let playerName = data[1]
    let playerSlot = data[2]
    CreateLocalPlayer(spriteId, playerName, playerSlot)
})

//we joined the room and the room has sent a message that we should now create our local player
socket.on('joinedRoomCreateLocalPlayer', function(){
    socket.emit('askAuthorityToCreateLocalPlayer', nameFieldValue) //it has to go to the relay server first then it relays it to the authority which sends us back info needed to create our local player
})

//. pretty sure this is not used anymore for anything - we use a different method of turning the shield on now
socket.on(utils.msg().shieldOn, function(data){
    let spriteId = data
    let sprite = clientUtils.GetEntityBySpriteId(spriteId)
    //. lets just not for now, might interfere with the new system
    //LocalShieldOn(sprite)
})

socket.on(utils.msg().shieldOff, function(data){
    StopAbilityByCode(utils.msg().abilityShield, player)
})

socket.on(utils.msg().shieldBreak, function(data){
    if(socket.id == authority) return //the authority is the source of where the shield break happened in the first place they dont need it
    let playerSlot = data
    let p = clientUtils.GetPlayerBySlot(playerSlot)
    if(!p) return
    let skipNetShieldOff = true //stops an infinite loop of emits
    p.ShieldBreak(skipNetShieldOff)
})

socket.on(utils.msg().setShieldHealth, function(data){
    let hp = data
    player.SetShieldHealth(hp)
})

socket.on(utils.msg().setPosition, function(data){
    let spriteId = data[0]
    let x = data[1]
    let y = data[2]
    let sprite = clientUtils.GetEntityBySpriteId(spriteId)
    if(sprite) clientUtils.SetPosition(sprite, x, y)
})

//this message is for debug purposes we can remove it in the final game to save an uneccessary emit
socket.on(utils.msg().reportRoomInfo, function(data){
    let roomId = data
    console.log(`entered room ${roomId} (save a packet if you disable the emit that sends us this message)`)
})

export function CreateLocalPlayer(newSpriteId, spriteName, playerSlot){
    let playerConfig = {
        scene: game.scene.scenes[1],
        key: 'player',
        socketId: socket.id,
    }
    let player = SetPlayer(new Player(playerConfig))
    player.playerSlot = playerSlot
    socket.playerSlot = playerSlot
    player.spriteId = SetSpriteId(newSpriteId) //the authority sent us which spriteId we should have
    player.stateUpdater = socket.id
    game.scene.scenes[1].cameras.main.startFollow(player, true, 1, 1) //last 2 numbers are for smooth following. 1 = instant follow
    clientUtils.PlayerListAdd(player)
    AddFloatingNameTo(player, spriteName)
    SendToPlayerSpawn(player)
    AddToRadar(player)
    socket.emit('localPlayerCreated', [player.spriteId, socket.id, player.x, player.y, spriteName])
    //. idk why but if i run these without setTimeout the overlays for them do not sync, like it thinks its still at default overlays i guess? idk. too soon after the class constructor perhaps? oh well this seems to work
    //* oh i think i get it, we emit 'localPlayerCreated' in this function which tells the authority to tell everyone else to create a new RemotePlayer representing us. so due to jitter, if we add these overlays immediately, its going to send them, but will not find a RemotePlayer on the other side to receive them, and so the message will get ignored, it will not send it again until overlays change again because it thinks it already sent it to that person and they got it, but they didnt get it.
    setTimeout(function(){
        GiveDefaultAbilities()
        //let hat = utils.Pick(allHats)
        let hat = allHats[0] //barbarian hat
        hat.Equip()
    }, 150) //we do 150 ms to just account for jitter to make sure our RemotePlayer is created by the time we add these here overlays and they get emitted, if theres no RemotePlayer to receive them yet due to jitter, then the emits get ignored
}

function AddRemotePlayerToScene(spriteId, socketId, xPos, yPos, spriteName, playerSlot){
    let remoteConfig = {
        scene: game.scene.scenes[1],
        key: 'player',
        socketId: socketId,
    }
    let remoteSprite = new RemotePlayer(remoteConfig)
    remoteSprite.playerSlot = playerSlot
    remoteSprite.spriteId = SetSpriteId(spriteId)
    remoteSprite.stateUpdater = socketId
    remoteSprite.setPosition(xPos, yPos)
    remotePlayers.push(remoteSprite)
    clientUtils.PlayerListAdd(remoteSprite)
    AddFloatingNameTo(remoteSprite, spriteName)
    console.log(`RemotePlayer created with spriteId ${remoteSprite.spriteId} at ${xPos}, ${yPos}`)
    return remoteSprite
}

export function SendToPlayerSpawn(sprite){
    let x = game.scene.scenes[1].worldBoundsX / 2
    let y = game.scene.scenes[1].worldBoundsY / 2
    sprite.setPosition(x, y)
    socket.emit(utils.msg().setPosition, [sprite.spriteId, x, y])
}
//* our https code wasnt working on heroku so we are back to http for now, heroku gives you an https address anyway so i guess it doesnt matter - netlify also has https automatic

module.exports = {
    GetIO: GetIO,
}

const utils = require('./utils')
const serverUtils = require('./serverUtils')

//* express portion
const express = require('express')
const app = express()
const fs = require('fs') //lets us interact with files in the file system
//const https = require('https') //* remember to uncomment this for https

//app.use(express.static('dist')) //what directory to use for static resources to send to the client i think, scripts, images, index.html etc
app.use(express.static(__dirname + '/dist'))

//i dont know what this is but it has something to do with GET, aka: GET & POST. req, res = request, response
app.get('/', function (req, res){
  res.sendFile(__dirname + '/dist/index.html')
})

//process.env.PORT is related to deploying on heroku //* this is an http server not https
var server = app.listen(process.env.PORT || 8888, function(){
    let host = server.address().address
    let port = server.address().port
    console.log("http server listening on" + host + ":" + port)
})

/*var httpsServer = https.createServer({
    //. HEY. these ssl certs are self-signed which means they're always going to be untrusted. apparently what we need for real deployment is a Domain Validated Certificate, which you only get if you own a domain. it isnt time for us to do that yet but we can solve it later by doing that. apparently self-signed certs arent worth anything.
    //* apparently i can get a domain for 1$ from namecheap for testing.
    key: fs.readFileSync('server.key'), //* these are https ssl certificates, we ran this command on the vps console: openssl req -nodes -new -x509 -keyout server.key -out server.cert    ...to generate a certificate. we may have to do this again in the future on other vps.
    cert: fs.readFileSync('server.cert')
}, app)

httpsServer.listen(process.env.PORT || 8888, function(){
    let host = httpsServer.address().address
    let port = httpsServer.address().port
    console.log("https server listening on" + host + ":" + port)
})*/

//* websocket portion
// using socket.volatile.emit() instead of socket.emit() according to docs sends a message without any care if it was received or not
//var io = require('socket.io')(httpsServer) //we were originally using 'server' instead of 'httpsServer' but portals want https not http?
var io = require('socket.io')(server) //* use the one above for https

var sockets = []
var socketId2room = {} //key: a socketId, value: room object the socket is in
var hash2socket = {} //key: hashId, value: socket

function FindSocketById(id){
    for(let i in sockets){
        let socket = sockets[i]
        if(socket.id == id) return socket
    }
}

function HandleHatMessage(socket, msg, data){
    //data is either 1 or nothing, indicating equip or unequip
    let newData
    if(data) newData = [socket.playerSlot, data]
    else newData = socket.playerSlot
    io.to(socket.roomObject.authority).emit(msg, newData) //. CURRENTLY ONLY THE AUTHORITY NEEDS TO KNOW THIS PLAYER EQUIPPED A HAT - TO APPLY THE STATS
}

function AbilityMessageHandler(socket, msg, data){
    //* data is either null or a compressedAngle. if it is null then we have been told to stop performing this ability if applicable.
    let receivers = serverUtils.GetSocketsInRangeOf(999, socket.x, socket.y, socket.roomObject)
    receivers.push(socket.roomObject.authoritySocket) //authority always needs bullets spawned on their side regardless of range, because damage occurs there.
    let newData
    if(!data) newData = socket.playerSlot
    else newData = [socket.playerSlot, data]
    for(let s of receivers){
        if(s.id == socket.id) continue
        io.to(s.id).emit(msg, newData)
    }
}

function FindSocketInRoomBySlot(room, slot){
    for(let i in room.clients){
        let socket = room.clients[i]
        if(socket.playerSlot == slot) return socket
    }
}

io.on("connection", function(socket){
    sockets.push(socket)
    socket.sleeping = false //if they change tabs the socket becomes asleep because the render loop stops (its beyond our control) so we must handle certain things accordingly such as authority switching. for example a socket that is asleep can not be picked to be authority
    socket.lastSleepBegin = 0 //Date.now() when their last sleep began.
    socket.roomObject = null //room object that we are currently in
    socket.lastLatency = 0 //ms
    socket.hashId = utils.HashCode(socket.id)
    socketId2room[socket.id] = null
    hash2socket[socket.hashId] = socket
    //console.log(`client ${socket.id} connected`)

    socket.on(utils.msg().netSpawn, function(data){
        BroadcastToAllRoomsOf(socket, utils.msg().netSpawn, data)
    })

    socket.on(utils.msg().netSpawnFor, function(data){
        //let data = [socket.hashId, ClassNameToClassIndex(s.className), s.spriteId, Math.round(s.x), Math.round(s.y), utils.CompressAngle(s.angle), utils.CompressFloat(s.scale)]
        let playerSlot = data[0]
        let otherSocket = FindSocketInRoomBySlot(socket.roomObject, playerSlot)
        if(!otherSocket) return
        let newData = [data[1], data[2], data[3], data[4], data[5], data[6]]
        io.to(otherSocket.id).emit(utils.msg().netSpawn, newData) //. notice this is a netSpawn message, yea we use the same system as netSpawn just to a specific person now - so keep in mind the data format must be identical for netSpawn and netSpawnFor due to this, once it reaches this point where it is being sent to the specific person that is
    })

    //. BEGIN ABILITY BLOCK
    //* all abilities must be specially sent to the authority regardless of range, or you have the problem of when theyre not in range of the authority their bullets dont spawn on the authority and they cant kill anything because damage occurs on the authority
    socket.on(utils.msg().abilityMelee, function(data){
        let msg = utils.msg().abilityMelee //. make sure this always matches the one above!!
        AbilityMessageHandler(socket, msg, data)
    })
    socket.on(utils.msg().abilityBlast, function(data){
        let msg = utils.msg().abilityBlast //. make sure this always matches the one above!!
        AbilityMessageHandler(socket, msg, data)
    })
    socket.on(utils.msg().abilityRapidBlast, function(data){
        let msg = utils.msg().abilityRapidBlast //. make sure this always matches the one above!!
        AbilityMessageHandler(socket, msg, data)
    })
    socket.on(utils.msg().abilityBow, function(data){
        let msg = utils.msg().abilityBow //. make sure this always matches the one above!!
        AbilityMessageHandler(socket, msg, data)
    })
    socket.on(utils.msg().abilityWizardAoE, function(data){
        let msg = utils.msg().abilityWizardAoE //. make sure this always matches the one above!!
        AbilityMessageHandler(socket, msg, data)
    })
    socket.on(utils.msg().abilitySword, function(data){
        let msg = utils.msg().abilitySword //. make sure this always matches the one above!!
        AbilityMessageHandler(socket, msg, data)
    })
    //. END ABILITY BLOCK

    //. BEGIN HAT BLOCK
    socket.on(utils.msg().barbarianHat, function(data){
        let msg = utils.msg().barbarianHat //. make sure this always matches the one above!!
        HandleHatMessage(socket, msg, data)
    })
    socket.on(utils.msg().mageHat, function(data){
        let msg = utils.msg().mageHat //. make sure this always matches the one above!!
        HandleHatMessage(socket, msg, data)
    })
    socket.on(utils.msg().gokuHat, function(data){
        let msg = utils.msg().gokuHat //. make sure this always matches the one above!!
        HandleHatMessage(socket, msg, data)
    })
    socket.on(utils.msg().killuaHat, function(data){
        let msg = utils.msg().killuaHat //. make sure this always matches the one above!!
        HandleHatMessage(socket, msg, data)
    })
    socket.on(utils.msg().brainletHat, function(data){
        let msg = utils.msg().brainletHat //. make sure this always matches the one above!!
        HandleHatMessage(socket, msg, data)
    })
    //. END HAT BLOCK

    //. BEGIN STAT LEVEL BLOCK
    socket.on(utils.msg().requestPower, function(){
        io.to(socket.roomObject.authority).emit(utils.msg().requestPower, socket.playerSlot)
    })
    socket.on(utils.msg().requestDurability, function(){
        io.to(socket.roomObject.authority).emit(utils.msg().requestDurability, socket.playerSlot)
    })
    socket.on(utils.msg().requestSpeed, function(){
        io.to(socket.roomObject.authority).emit(utils.msg().requestSpeed, socket.playerSlot)
    })
    socket.on(utils.msg().requestStamina, function(){
        io.to(socket.roomObject.authority).emit(utils.msg().requestStamina, socket.playerSlot)
    })
    socket.on(utils.msg().requestVitality, function(){
        io.to(socket.roomObject.authority).emit(utils.msg().requestVitality, socket.playerSlot)
    })
    socket.on(utils.msg().requestSpirit, function(){
        io.to(socket.roomObject.authority).emit(utils.msg().requestSpirit, socket.playerSlot)
    })
    //. END STAT LEVEL BLOCK

    socket.on(utils.msg().sleep, function(){
        if(!socket.sleeping){
            socket.lastSleepBegin = Date.now()
        }
        socket.sleeping = true //a sleeping socket can not be chosen to be authority, and if it has authority already then it loses authority
        //* if the authority has gone to sleep then we need to find a new authority
        //make sure this happens after socket.sleeping = true or it will still think this socket is awake and viable to be chosen again as the authority, but it isnt
        if(socket.roomObject && socket.roomObject.authority == socket.id){
            socket.roomObject.RoomFindBestAuthority()
        }
    })

    socket.on(utils.msg().wake, function(){
        socket.sleeping = false
    })

    socket.on(utils.msg().latencyUpdate, function(data){
        socket.lastLatency = data
        //console.log(socket.lastLatency)
    })

    //. pretty sure we are using the 'shielding' netvar now to tell the authority if the player is currently using shield now - so this probably does nothing
    socket.on(utils.msg().shieldOn, function(data){
        let spriteId = data
        //IOEmitToAllRoomsOf(socket, utils.msg().shieldOn, spriteId)
        io.to(socket.roomObject.authority).emit(utils.msg().shieldOn, spriteId)
    })

    //. this however we are using for when a shield break occurs on the authority - it tells whoever owns the player to turn their shield off on their side
    socket.on(utils.msg().shieldOff, function(data){
        //IOEmitToAllRoomsOf(socket, utils.msg().shieldOff, spriteId)
        let slot = data
        let s = FindSocketInRoomBySlot(socket.roomObject, slot)
        if(!s) return
        io.to(s.id).emit(utils.msg().shieldOff) //a client getting this event is implied to be specifically for their own local character
    })

    socket.on(utils.msg().shieldBreak, function(data){
        //BroadcastToAllRoomsOf(socket, utils.msg().shieldBreak, spriteId)
        let playerSlot = data
        let s = FindSocketInRoomBySlot(socket.roomObject, playerSlot)
        if(!s) return
        let receivers = serverUtils.GetSocketsInRangeOf(1300, socket.x, socket.y, socket.roomObject)
        for(let i in receivers){
            let os = receivers[i]
            io.to(os.id).emit(utils.msg().shieldBreak, playerSlot)
        }
    })

    socket.on(utils.msg().setShieldHealth, function(data){
        //BroadcastToAllRoomsOf(socket, utils.msg().setShieldHealth, data)
        //. now only the owner of the local player needs to know this message - not everyone like before
        let playerSlot = data[0]
        let s = FindSocketInRoomBySlot(socket.roomObject, playerSlot)
        if(!s) return
        let hp = data[1]
        io.to(s.id).emit(utils.msg().setShieldHealth, hp) //. its currently implied that getting a setShieldHealth message is for their own player
    })

    socket.on(utils.msg().setPosition, function(data){
        IOEmitToAllRoomsOf(socket, utils.msg().setPosition, data)
    })

    //this is someone who has crossed the power gem and is trying to pick it up - it will be relayed to the authority who will determine if they should be allowed to get it
    socket.on(utils.msg().tryGetPowerGem, function(data){
        let room = socket.roomObject
        if(!room) return
        io.to(room.authority).emit(utils.msg().tryGetPowerGem, socket.playerSlot) //ask the authority if this person should be allowed to get the power gem
    })

    //this is the authority telling everyone to assign someone as the new gem holder
    socket.on(utils.msg().assignGemHolder, function(data){
        let playerSlot = data
        BroadcastToAllRoomsOf(socket, utils.msg().assignGemHolder, data)
    })

    socket.on(utils.msg().removePowerGemFrom, function(data){
        let playerSlot = data
        BroadcastToAllRoomsOf(socket, utils.msg().removePowerGemFrom, data)
    })

    socket.on(utils.msg().givePowerGemData, function(data){
        let sendToSlot = data[0]
        let gemHolderSlot = data[1]
        let s = FindSocketInRoomBySlot(socket.roomObject, sendToSlot)
        if(!s) return
        let newData = gemHolderSlot
        io.to(s.id).emit(utils.msg().givePowerGemData, newData)
    })

    //when the client first joins it tells the server to have it join the Title Screen room
    socket.on('joinRoom', function(room){
        socket.join(room)
    })

    socket.on('gameVersion', function(ver){
        if(utils.GameVersion() != ver){
            socket.emit('wrongVersion')
        }
    })
    
    socket.on('disconnecting', function(){
        sockets = utils.remove(sockets, socket)
        IOEmitToAllRoomsOf(socket, 'disconnecting', socket.id) //tell all players to remove this player
        LeaveAllRooms(socket)
    })

    socket.on(utils.msg().chatMessage, function(data){
        IOEmitToAllRoomsOf(socket, utils.msg().chatMessage, data)
    })

    //disconnect/connect is a built in message to socket.io that happens on its own
    //. by the time this event fires socket.rooms has been auto cleared by socket.io so you cant do anything regarding rooms here, using 'disconnecting'
    socket.on('disconnect', function(){
        //console.log(`client ${socket.id} disconnected`)
        socket.roomObject = null //i just think this is a good thing to do
    })

    socket.on('localPlayerCreated', function(data){
        //let room = socketId2room[socket.id]
        let spriteId = data[0]
        let socketId = data[1]
        let x = data[2]
        let y = data[3]
        let spriteName = data[4]
        let playerSlot = socket.playerSlot
        //* broadcast sends to all clients except the socket sending it
        let newData = [spriteId, socketId, x, y, spriteName, playerSlot]
        BroadcastToAllRoomsOf(socket, 'newRemotePlayer', newData) //message telling client to spawn a remote player for a client that joined
        socket.spriteId = spriteId
        socket.spriteName = spriteName
    })

    socket.on('leaveTitleScreen', function(){
        socket.leave('Title Screen')
        //* because joining a room (socket.join) is asyncronous we can not continue until it joins or our emits below will not go to the intended room, so we use a callback
        JoinDynamicRoom(socket, function(err){
            //do something at some point if we ever need to, just a demonstration of the callback
        })
    })

    socket.on('askAuthorityToCreateLocalPlayer', function(data){
        let playerName = data
        let room = socketId2room[socket.id]
        if(!room){
            //console.log(`BUG: room with socketId ${socket.id} not found`)
            return
        }
        io.to(room.authority).emit('askAuthorityToCreateLocalPlayer', [socket.id, playerName])
    })

    socket.on('spawnEnemy', function(data){
        BroadcastToAllRoomsOf(socket, 'spawnEnemy', data)
    })

    socket.on('fullNpcList', function(data){
        let socketId = data[0]
        let roomId = data[1]
        let npcData = data[2]
        let room = FindRoomById(roomId)
        room.ReceiveFullNpcList(socketId, npcData)
    })

    socket.on(utils.msg().sendInRange, function(data){
        let receivers = data[0] //. this is an array of PLAYERSLOTS (playerSlot). the advantage is: playerSlot (1 byte). hashId (4 bytes). so we converted
        let tag = data[1]
        let newData = data[2]
        for(let i in receivers){
            let playerSlot = receivers[i]
            let room = socket.roomObject
            if(!room) return //somehow you are not in a room, so you are not allowed to sendinrange - //* pretty sure this happens because of socket.io automatic reconnects, if they lose connection, then regain connection, and are still trying to use SendInRange for things, but they left the room soon as they lost connection so players who lose connection we probably need to send them back to the title screen and disconnect their socket and stop their auto reconnects.
            for(let i in room.clients){
                let socket = room.clients[i]
                if(socket.playerSlot == playerSlot){
                    io.to(socket.id).emit(tag, newData)
                }
            }
        }
    })

    socket.on(utils.msg().destroySprite, function(data){
        let spriteId = data
        BroadcastToAllRoomsOf(socket, utils.msg().destroySprite, spriteId) //whoever sent this message is already in the process of destroying the object on their side so we dont tell them again or itll cause an infinite loop
    })

    //on this message from the authority, the relay server will tell the client they can create a local player, and what spriteId to give them
    socket.on('tellClientToCreateLocalPlayer', function(data){
        let socketId = data[0]
        let spriteId = data[1]
        let playerName = data[2]
        let otherSocket = FindSocketById(socketId)
        if(!otherSocket) return
        io.to(socketId).emit('tellClientToCreateLocalPlayer', [spriteId, playerName, otherSocket.playerSlot])
    })

    socket.on(utils.msg().knockback, function(data){
        let hashId = data[0]
        let otherSocket = hash2socket[hashId]
        if(!otherSocket) return
        let spriteId = data[1]
        let dist = data[2]
        let ang = data[3]
        otherSocket.emit(utils.msg().knockback, [spriteId, dist, ang])
    })

    socket.on(utils.msg().explosion, function(data){
        BroadcastToAllRoomsOf(socket, utils.msg().explosion, data)
    })

    socket.on(utils.msg().netvar, function(data){
        let room = socket.roomObject
        if(!room) return //this happens when we get a message for a socket who has already disconnected and their roomObject was set to null and so we just ignore it now
        RelayServerStoreNetVar(socket, data) //the relay server stores all data so when authority changes it sends it to the new authority so it can continue where the other left off
        let to = data[0] //example: utils.netvarTo().player or utils.netvarTo().everyone
        let id = data[1] //this is either a playerSlot or a spriteId depending on the context of 'to' //* if its a spriteId, we are probably sending information about that spriteId (which could be an npc) to everyone. if it is a playerSlot, we are sending this message to 1 specific player who occupies that player slot, and the message is about their own specific character object
        let varIndex = data[2]
        let value = data[3]
        
        let idType = 'spriteId'
        if(to == utils.netvarTo().player) idType = 'playerSlot'
        //. if this netvar update is for a var on this socket's own player we are going to store a little bit about it on the socket
        if((idType === 'spriteId' && id == socket.spriteId) || (idType === 'playerSlot' && id == socket.playerSlot)){
            //. posUpdate or slowPosUpdate - if you change the index of these netvars this is going to malfunction and you need to set these numbers to match the new index numbers
            if(varIndex == 0 || varIndex == 2){
                socket.x = value[0]
                socket.y = value[1]
            }
            //. angle update - same as above, if you change the index, you must change this number too
            if(varIndex == 1) socket.angle = value //? i believe this will be a compressed angle 0-255
        }
        //* as of writing this, socket.x / y / angle are not used for anything - but could be useful eventually
        
        if(to == utils.netvarTo().player && id == socket.playerSlot) return //if this message is specifically to us then we are sending our own values to ourselves, we should not do that because we already have the latest values and doing so would send our values back in time. so just ignore the message. //. we already have code in the function that sends out netvars to prevent sending it to ourselves but now we have a precaution here too just in case
        
        if(to == utils.netvarTo().server){
            //dont send it to anyone. we only sent it so the server can log it and hand it to the next authority
        }
        if(to == utils.netvarTo().player){
            for(let i in room.clients){
                let otherSocket = room.clients[i]
                if(otherSocket.id == socket.id) continue //we dont send a message for ourselves to ourselves, it makes no sense, we are already the decider of the value locally
                if(otherSocket.playerSlot == id){
                    io.to(otherSocket.id).emit(utils.msg().netvar, [varIndex, value])
                    break
                }
            }
        }
        //example: the authority needs to know if the client is holding down a certain button, etc
        if(to == utils.netvarTo().authority){
            if(socket.id != room.authority){ //no point currently in the authority sending its own message to itself
                io.to(room.authoritySocket.id).emit(utils.msg().netvar, [id, varIndex, value])
            }
        }
        if(to == utils.netvarTo().range){
            //. here, we specially send all netvars tagged 'local' & 'range' to the authority, regardless of the range. we want the authority to know the current position of all objects regardless of range or anything.
            if(socket.id != room.authority){ //if whoever is trying to send this netvar is not the authority, that means they are trying to send a 'local' netvar
                io.to(room.authoritySocket.id).emit(utils.msg().netvar, [id, varIndex, value]) //in which case, regardless of range, the authority must ALWAYS have it sent to them. because they should always know where all players are at all times. and the latest state of everything in general
            }
            if(data.length >= 5){ //if data < 5 it sent it with no receiver list, because no one was in range. but it still sends it to the server so the server can log the data
                let receivers = data[4] //an array of playerSlots
                if(!Array.isArray(receivers)) receivers = [receivers] //it was 1 receiver, send not as a list, so just make it a list for ez conformity
                for(let i in receivers){
                    let playerSlot = receivers[i]
                    for(let i2 in room.clients){
                        let otherSocket = room.clients[i2]
                        if(otherSocket.id == socket.id) continue //we dont send a message for ourselves to ourselves, it makes no sense, we are already the decider of the value locally
                        if(otherSocket.id == room.authority) continue //skip sending to the authority even if they are in range because we are already specially sending it to the authority no matter what above, so we dont want to send it twice
                        if(otherSocket.playerSlot == playerSlot){
                            io.to(otherSocket.id).emit(utils.msg().netvar, [id, varIndex, value]) //id will be a spriteId in the case of 'range'
                        }
                    }
                }
            }
        }
        if(to == utils.netvarTo().everyone){
            BroadcastToAllRoomsOf(socket, utils.msg().netvar, [id, varIndex, value])
        }
    })

    //. also check the 'disconnected' message because it removes references to disconnected players from storedData - okay nevermind it looks like we are actually handling that with the 'removeNonexistantsFromStoredData' message here in server.js, because on an authority change, if a player's (or any object's) sprite can no be found on the new authority we are transitioning to, the relay server is then told to remove the stored reference of it.
    socket.on(utils.msg().destroySpriteOnRelay, function(data){
        let spriteId = data[0].toString()
        let playerSlot
        if(typeof data[1] === 'number') playerSlot = data[1].toString() //npcs dont have player slots, etc, so itll be null
        let roomId = socket.roomObject.roomId.toString()

        let foundRef = false
        
        //if none was sent, this sprite had no spriteId assigned (SpriteAncestor probably)
        if(spriteId){
            let spriteIds = storedData[roomId]['spriteIds']
            if(spriteIds && spriteIds[spriteId] != undefined){
                delete spriteIds[spriteId]
                storedData[roomId]['spriteIds'] = spriteIds
                foundRef = true
            }
        }
        
        //if none was sent, this sprite had no hashId assigned
        if(playerSlot){
            let playerSlots = storedData[roomId]['playerSlots']
            if(playerSlots && playerSlots[playerSlot] != undefined){
                delete playerSlots[playerSlot]
                storedData[roomId]['playerSlots'] = playerSlots
                foundRef = true
            }
        }
        //if(foundRef) console.log('destroyed sprite reference on server')
        //else console.log('destroy failed because no reference of this sprite was found on the server')
    })

    socket.on(utils.msg().removeNonexistantsFromStoredData, function(data){
        let nonexistantSpriteIds = data[0]
        let nonexistantPlayerSlots = data[1]
        let roomId = socket.roomObject.roomId.toString()
        
        let spriteIds = storedData[roomId]['spriteIds']
        for(let i in nonexistantSpriteIds){
            let spriteId = nonexistantSpriteIds[i]
            if(spriteId.toString() in spriteIds){
                delete spriteIds[spriteId.toString()]
            }
        }
        storedData[roomId]['spriteIds'] = spriteIds

        let playerSlots = storedData[roomId]['playerSlots']
        for(let i in nonexistantPlayerSlots){
            let playerSlot = nonexistantPlayerSlots[i]
            if(playerSlot.toString() in playerSlots){
                delete playerSlots[playerSlot.toString()]
            }
        }
        storedData[roomId]['playerSlots'] = playerSlots
    })
})

var storedData = {}

//all stored data is room specific
function RelayServerStoreNetVar(socket, data){
    if(!socket.roomObject) return //something went wrong. the error crashes the server. im not sure what causes it but if i had to guess since when it happened it was the last person to leave the room so it was an empty room and idk it had already closed itself idk
    let to = data[0]
    let id = data[1] //this is either a spriteId or a playerSlot depending on context - actually i think netvars only use playerSlot now dont they? im not sure
    let varIndex = data[2]
    let value = data[3]
    let roomId = socket.roomObject.roomId.toString()
    let category = 'spriteIds'
    if(to == utils.netvarTo().player) category = 'playerSlots' //. why? just store everything under spriteIds
    if(storedData[roomId] == undefined) storedData[roomId] = {}
    if(storedData[roomId][category] == undefined) storedData[roomId][category] = {}
    if(storedData[roomId][category][id.toString()] == undefined) storedData[roomId][category][id.toString()] = {}
    storedData[roomId][category][id.toString()][varIndex.toString()] = value
}

//send to everyone in your room(s), even yourself
function IOEmitToAllRoomsOf(socket, tag, data){
    let socketRooms = Object.keys(socket.rooms)
    for(let i in socketRooms){
        let r = socketRooms[i]
        if(r == socket.id) continue //the socket's id is always in their room list for some reason, as if it counts as its own room
        io.to(r).emit(tag, data)
    }
}

//broadcast (send to everyone except yourself) in your room(s)
function BroadcastToAllRoomsOf(socket, tag, data){
    let socketRooms = Object.keys(socket.rooms)
    for(let i in socketRooms){
        let r = socketRooms[i]
        if(r == socket.id) continue //the socket's id is always in their room list for some reason, as if it counts as its own room
        socket.broadcast.to(r).emit(tag, data)
    }
}

function GetIO(){
    return io
}

//* ROOMS
//socket.io seems to have no list of rooms theyre just arbitrary strings stored on the socket what arbitrary rooms theyre in so we must make our own
var rooms = [] //contains RoomData classes

function FindRoomById(id){
    for(let i in rooms){
        let room = rooms[i]
        if(room.roomId == id) return room
    }
}

function JoinDynamicRoom(socket, callback){
    let room = GetAvailableRoomOrMakeNew()
    return room.TryJoin(socket, callback)
}

function LeaveAllRooms(socket){
    for(let i in rooms){
        rooms[i].Leave(socket)
    }
    socket.leaveAll()
}

//tries to get an available one but creates a new one if none is found
function GetAvailableRoomOrMakeNew(){
    return GetAvailableRoomFromExisting() || CreateNewDyanamicRoom()
}

function CreateNewDyanamicRoom(){
    return new RoomData()
}

function GetAvailableRoomFromExisting(){
    if(!rooms.length) return null
    let bestRoom
    for(let i in rooms){
        let room = rooms[i]
        if(!room){
            rooms = utils.remove(rooms, room)
            continue
        }
        if(room.RoomFull()) continue
        //we send the client into the 'best' room which means the room that is MOST full.
        if(!bestRoom || room.EmptySlots() < bestRoom.EmptySlots()){
            bestRoom = room
        }
    }
    return bestRoom
}

var lastRoomId = 0

function NewRoomId(){
    lastRoomId++
    return lastRoomId
}

class RoomData{
    constructor(){
        let self = this
        this.authority = null //. the SOCKET ID of the authority
        this.authoritySocket = null //we didnt realize we would need more than the socketId until now, so here is the whole socket
        this.clientCount = 0
        this.maxClients = 10
        this.clients = [] //sockets
        this.roomId = NewRoomId()
        this.roomName = `Room ${this.roomId}` //* we join rooms by roomId, roomName is cosmetic and can be anything
        this.playerSlots = [] //reusable slots, like if player with slot #2 leaves then slot #2 can be taken by a new player, this ties into the playerSlot var on the player's sprite that is just one of many ways to refer to them now in a network message, it only uses 1 byte to id them which is the lowest of all methods so far
        //. WARNING. these slots are no longer reusable. they increment by +1 every new player who joins. we just have to accept that itll go from 1 byte to 2 bytes. why? because there are many problems where if a player leaves and a new player joins with the same slot, a lot of the systems of the game think they are still the same player. for example netvars, it wont send values it thinks it already sent to them, even though it isnt even the same player, all because the slots match.
        this.lastPlayerSlot = 0
        rooms.push(this)
    }

    IfAuthorityIsInvalidButIAmValidMakeMeAuthority(socket){
        if(!this.authoritySocket || this.authoritySocket.sleeping || this.authoritySocket.lastLatency > 400){
            this.RoomFindBestAuthority()
        }
    }

    TryJoin(socket, callback){
        if(this.RoomFull()){
            if(callback) callback('Error: The room was full. Can not join')
            return false
        }
        this.Join(socket, callback)
        return true
    }

    //the socket joins an empty player slot
    AssignEmptySlotTo(socket){
        this.lastPlayerSlot++
        socket.playerSlot = this.lastPlayerSlot
        return

        //unitialized. so initialize.
        if(this.playerSlots.length == 0){
            for(let i = 0; i < this.maxClients; i++){
                this.playerSlots.push({socket: undefined}) //prefill it with x amount of objects for new players to occupy. new players will join the first empty slot it can find
            }
        }
        //now find them the first unoccupied slot
        for(let i = 0; i < this.playerSlots.length; i++){
            let slot = this.playerSlots[i]
            if(!slot.socket){
                this.playerSlots[i].socket = socket
                socket.playerSlot = i
                break
            }
        }        
    }

    ClearPlayerSlotFor(socket){
        socket.playerSlot = null
        return

        for(let i = 0; i < this.playerSlots.length; i++){
            let slot = this.playerSlots[i]
            if(slot.socket == socket){
                this.playerSlots[i].socket = null
                socket.playerSlot = null
                return
            }
        }
    }

    Join(socket, callback){
        let room = this
        //the moment any client joins na empty room, create a directory for this room in storedData if there isnt one yet - keep in mind we purge the directory if the room ever becomes empty thats why we recreate it here again when it becomes un-empty
        if(this.clientCount == 0 && storedData[this.roomId.toString()] == undefined) storedData[this.roomId.toString()] = {}
        if(this.IsInRoom(socket)){
            if(callback) callback('Error: Client is already in this room. Can not join')
            return
        }
        this.AssignEmptySlotTo(socket)
        socket.roomObject = this
        this.clientCount++
        this.clients.push(socket)
        socketId2room[socket.id] = this
        this.IfNoAuthorityFindAuthority()
        socket.join(this.roomId.toString(), function(err){
            if(callback) callback(err)
            //we delay this because it seems to behave better - their local client gets time to be told what room theyre apart of and who the authority of that room is - it seems to stop a bug where sometimes a player joining near the exact same time as you just isnt sent to you and is therefore invisible because your side just wasnt set up yet to receive that message - this is all just guessing though
            setTimeout(function(){
                if(!socket || !room) return
                room.SendExistingPlayers(socket)
                room.RequestExistingNpcsFor(socket)
            }, 1000)
        })
        this.IfAuthorityIsInvalidButIAmValidMakeMeAuthority(socket) //in a room with 1 player for example, someone has to be authority, even if its a player that is inactive in another tab with a frozen game. but this presents the problem of new players joining only to be stuck in a room with a sleeping authority and the game will not be updating at all for them. so if a player logs into a room where the only available authority is currently asleep, switch authority to this newly connecting client who is clearly a better candidate and not asleep and they will be the authority

        socket.emit('setAuthority', [this.authority, this.authoritySocket.playerSlot]) //tell the client who the authority of the room is
        socket.emit('joinedRoomCreateLocalPlayer') //begin the process of the client creating their local player
        socket.emit(utils.msg().reportRoomInfo, this.roomId) //. NOT NEEDED. just reports debug info to the client about what room they just joined. uncomment whenever
        if(this.clientCount == 1) socket.emit(utils.msg().firstPlayerJoinedRoom) //if this is the first person to join the room then the "game" essentially does not exist yet - there are no npcs and such, so send this message to initialize all the things the first authority must take care of for the game to be exist
        if(this.clientCount != 1){
            //if you are the first player to join the room you dont need to do this, but otherwise when you join a room, ask where the power gem currently is, so it can be created on our side too
            room.RequestPowerGemDataFor(socket)
        }
    }

    Leave(socket, callback){
        if(!this.IsInRoom(socket)) return
        this.ClearPlayerSlotFor(socket)
        this.clientCount--
        this.clients = utils.remove(this.clients, socket)
        delete socketId2room[socket.id] //. if these 'delete' lines dont work just set their values to null instead
        socket.leave(this.roomId.toString(), callback)
        //socket.roomObject = null //. we moved this to the 'disconnect' event so it happens at the very end because it was giving us lots of runtime errors of 'roomObject is null'
        this.AuthorityDisconnectCheck(socket)
        if(this.clientCount <= 0){
            this.RoomEmptySoPurgeStoredData() //the last player left so purge any stored data its not needed any more
        }
        //* i decide not to delete empty rooms right now because if room 1 is empty and deletes itself for example there will never be a room 1 again because that room id has been used 
        /*if(this.clientCount <= 0){
            rooms = utils.remove(rooms, this)
            delete this
        }*/
    }

    RoomEmptySoPurgeStoredData(){
        if(storedData[this.roomId.toString()] == undefined) return //no data to begin with
        delete storedData[this.roomId.toString()] //delete the entire key & value from the dictionary
    }

    //spawn all players (as remoteplayers) for a client who just joined the room
    SendExistingPlayers(socket){
        let data = []
        for(let i in this.clients){
            let s = this.clients[i]
            if(s.id == socket.id) continue //skip historical data about yourself, you are already spawned for yourself. this is for spawning players who existed before you joined
            //data.push([s.id, s.spriteId, s.spriteName, s.overlayData, s.playerSlot])
            if(!s.spriteId && s.spriteId !== 0) continue //. if they have no spriteId yet, they are a client in this room but they have not had time yet to spawn their player object, so just skip them, they arent ready - if we sent this it would tell them to spawn a remote player with spriteId null at x null and y null, we had this problem before
            data.push([s.id, s.spriteId, s.spriteName, s.playerSlot, s.x, s.y])
        }
        socket.emit('spawnPastPlayers', data)
    }

    RequestExistingNpcsFor(socket){
        if(this.authority == socket.id) return //the authority already has the npcs it doesnt need to send itself its own list of npcs
        io.to(this.authority).emit('requestNpcList', [socket.id, this.roomId])
    }

    ReceiveFullNpcList(socketId, npcData){
        let socket = this.FindClientInRoomById(socketId)
        socket.emit('spawnPastNPCs', npcData)
    }

    //for the new player who has just joined, we now ask the authority to send them the data of where the power gem is and such, so that it can appear on the new player's screen too
    RequestPowerGemDataFor(socket){
        if(this.authority == socket.id) return //you dont need it if you are the authority - you already have it
        io.to(this.authority).emit(utils.msg().requestPowerGemData, socket.playerSlot)
    }

    //. by socket.id that is
    FindClientInRoomById(id){
        for(let i in this.clients){
            let socket = this.clients[i]
            if(socket.id == id) return socket
        }
    }

    AuthorityDisconnectCheck(socket){
        if(!socket.id || socket.id != this.authority) return
        this.RoomFindBestAuthority()
        //* if they are leaving the game, they cant be the authority no matter what, even if no one else is left to take it. so clear the variables.
        if(this.authority == socket.id){
            this.authority = null
            this.authoritySocket = null
        }
    }

    RoomFindBestAuthority(){
        let oa = this.authoritySocket //old authority
        let na = this.GetBestAuthoritySocket() //new authority //. this CAN return the current authority if it has no other choice
        if(!oa){ //they left the game, they cant be authority anymore.
            this.authority = null
            this.authoritySocket = null
        }
        if(na){
            this.authority = na.id
            this.authoritySocket = na
        }
        if(na && na != oa){
            let storedRoomData = storedData[this.roomId.toString()]
            //if storedRoomData is null that means the very first player has just joined this new unused room and there is no stored data to even send them yet - so dont bother sending it
            if(storedRoomData){
                io.to(this.authority).emit(utils.msg().storedData, storedData[this.roomId.toString()]) //the new authority will need to know all the stored data for the room, so the state can continue where the last authority left off
            }
            this.SendEveryoneNewAuthority()
        }
    }

    SendEveryoneNewAuthority(){
        io.to(this.roomId.toString()).emit('setAuthority', [this.authority, this.authoritySocket.playerSlot])
    }

    IfNoAuthorityFindAuthority(){
        if(this.authority) return
        this.RoomFindBestAuthority()
    }

    GetBestAuthoritySocket(){
        if(!this.clients.length) return null //no one is in the room
        let eligibleClients = []
        //first we disqualify sockets that shouldnt be authority anyway
        for(let i in this.clients){
            let client = this.clients[i]
            if(client.sleeping) continue //sleeping clients are not eligible for authority
            if(client.lastLatency > 400) continue //too laggy to be authority
            eligibleClients.push(client)
        }
        //now we pick the best out of the remaining ones to become authority
        let bestClient = null
        for(let i in eligibleClients){
            let client = eligibleClients[i]
            if(!bestClient || client.lastSleepBegin < bestClient.lastSleepBegin){
                bestClient = client //right now the client who has been awake uninterrupted the longest becomes the authority. we can add other factors later to better determine who should be authority, such as average latency
            }
        }
        if(!bestClient && this.authoritySocket && this.FindClientInRoomById(this.authority)) return this.authoritySocket //. if we couldnt find a replacement authority we better just keep the one we have right? better than ending up with no authority, the entire game would break wouldnt it? if there is only 1 client in the room they HAVE to be the authority no matter what, correct? so this does that.
        if(!bestClient && this.clients.length > 0) return this.clients[0] //. as long as there is 1 or more people in the room, SOMEONE has to be the authority, even if all sockets were found to be ineligible, but someone IS in the room so just pick whoever has been there the longest. it should never return null authority if SOMEONE is in the room they have to be the authority.
        return bestClient
        //* later we should refactor this with a function to give each socket an AuthorityScore and then just pick the one with the best score, rather than all this crazy disqualification code which could disqualify all sockets entirely leaving no authority at all if we didnt have the other code further down in the function to make sure SOMEONE becomes authority if anyone is in the room regardless of qualifications
        //. for now it will work though we can move on
    }

    RoomFull(){
        if(this.clientCount >= this.maxClients) return true
        return false
    }

    EmptySlots(){
        let slots = this.maxClients - this.clientCount
        if(slots < 0) slots = 0
        return slots
    }

    IsInRoom(socket){
        for(let i in this.clients){
            let client = this.clients[i]
            if(client == socket) return client
        }
        return false
    }
}
//. utilities that wouldnt even work on the server, only the client

module.exports = {
    GetPlayers: GetPlayers,
    GetSpritesInRange: GetSpritesInRange,
    GetPlayersInRange: GetPlayersInRange,
    GetEntitiesInRange: GetEntitiesInRange,
    SpriteDistance: SpriteDistance,
    AllSpritesAdd: AllSpritesAdd,
    AllSpritesRemove: AllSpritesRemove,
    PlayerListAdd: PlayerListAdd,
    PlayerListRemove: PlayerListRemove,
    EntityListAdd: EntityListAdd,
    EntityListRemove: EntityListRemove,
    GetEntityList: GetEntityList,
    GetEntityBySpriteId: GetEntityBySpriteId,
    GetSpriteBySpriteId: GetSpriteBySpriteId,
    AddOverlaysFromIds: AddOverlaysFromIds,
    SendToRandomVoid: SendToRandomVoid,
    LookAngle: LookAngle,
    AbsLookAngle: AbsLookAngle,
    NetVarCompress: NetVarCompress,
    NetVarDecompress: NetVarDecompress,
    GetPlayerByHashId: GetPlayerByHashId,
    SpriteKeyToId: SpriteKeyToId,
    SpriteIdToKey: SpriteIdToKey,
    GetPlayerBySlot: GetPlayerBySlot,
    SetPosition: SetPosition,
    SetVelocity: SetVelocity,
    SetSleeping: SetSleeping,
    Overlapping: Overlapping,
}

var utils = require('../utils')

//we use these to send just 1 byte over the network instead which sprite key to use on something
//. if CERTAIN overlays fail to sync while all the others do then LOOK HERE because it means the overlay name you are using either does not have an entry here or the entry name does not match the overlay name. VERY IMPORTANT that every time you add a NEW OVERLAY TO THE GAME that you PUT IT HERE TOO or it CAN NOT BE NETWORKED and will BE INVISIBLE ON OTHER PEOPLES SIDES.
var spriteKeyId = {
    hatchet: 0,
    shield: 1,
    electricOverlay: 2,
    mageHat: 3,
    fighterHat: 4,
    staff: 5,
    blueKiShot: 6,
    rapidBlast: 7,
    bow: 8,
    arrow: 9,
    aoeBullet: 10,
    swordBullet: 11,
    sword: 12,
    gokuHair: 13,
    killuaHair: 14,
    brainletHat: 15,
}

function SpriteKeyToId(name){
    return spriteKeyId[name]
}

function SpriteIdToKey(id){
    for(let key in spriteKeyId){
        if(spriteKeyId[key] == id) return key.toString()
    }
}

//. this is no longer used for anything but it might still be useful for something later
function AddOverlaysFromIds(sprite, ids){
    if(!ids || ids.length == 0) return
    for(let id of ids){
        let key = SpriteIdToKey(id)
        sprite.AddOverlay(key)
    }
}

//. this returns a COPY of varData (which is a dictionary) because altering the direct reference was causing us problems.
function NetVarCompress(varData){
    if(!varData.compress) return varData //no compression method is defined
    let copy = utils.CloneObject(varData) //. a copy of the dictionary so we dont have to alter the vars on the main reference
    if(typeof copy.value == 'number') copy.value = NetVarValueCompress(copy.value, copy.compress)
    else if(Array.isArray(copy.value)){
        //. yes you are seeing this right, the compression for arrays is only 1 level deep. if theres nested arrays they will be uncompressed. it was too hard to figure out for now, add it later if you want. also check NetVarDecompress() because it only DECOMPRESSES 1 level deep too.
        for(let i in copy.value){
            let value = copy.value[i]
            if(typeof value == 'number') copy.value[i] = NetVarValueCompress(value, copy.compress)
        }
    }
    return copy
}

function NetVarValueCompress(value, compress){
    switch(compress){
        case 'round':
            return Math.round(value)
            break;
        case 'float':
            return utils.CompressFloat(value)
            break;
        case 'angle':
            return utils.CompressAngle(value)
            break;
        default:
            return value
    }
}

//. alters and returns a COPY because js dictionaries are done by reference and that was causing us problems.
function NetVarDecompress(varData){
    if(!varData.compress) return varData //no compression method is defined
    let copy = utils.CloneObject(varData)
    if(typeof copy.value == 'number') copy.value = NetVarValueDecompress(copy.value, copy.compress)
    else if(copy.value.isArray){
        for(let i in copy.value){
            let value = copy.value[i]
            if(typeof value == 'number') copy.value[i] = NetVarValueDecompress(value, copy.compress)
        }
    }
    return copy
}

function NetVarValueDecompress(value, compress){
    switch(compress){
        case 'float':
            return utils.DecompressFloat(value)
            break;
        case 'angle':
            return utils.DecompressAngle(value)
            break;
        default:
            return value
    }
}

var allSprites = [] //all sprites no matter what they are, overlays, whatever

function AllSpritesAdd(s){
    allSprites.push(s)
}

function AllSpritesRemove(s){
    allSprites = utils.remove(allSprites, s)
}

function GetSpriteBySpriteId(spriteId){
    for(let i in allSprites){
        let o = allSprites[i]
        if(o.spriteId == spriteId) return o
    }
}

var players = []

function GetPlayers(){
    return players
}

function PlayerListAdd(s){
    players.push(s)
}

function PlayerListRemove(s){
    //players = utils.remove(players, s)
    let index = players.indexOf(s)
    if(index === -1) return //not present - if you run players.slice(-1, 1) it WILL remove random shit from the end of the list so this is important
    players.splice(index, 1)
}

function GetPlayerByHashId(hashId){
    for(let i in players){
        let sprite = players[i]
        if(sprite.hashId = hashId) return sprite
    }
}

function GetPlayerBySlot(playerSlot){
    for(let p of players){
        if(p.playerSlot == playerSlot) return p
    }
}

var entities = []

function EntityListAdd(s){
    entities.push(s)
}

function EntityListRemove(s){
    entities = utils.remove(entities, s)
}

function GetEntityList(){
    return entities
}

function GetEntityBySpriteId(spriteId){
    for(let i in entities){
        let o = entities[i]
        if(o.spriteId == spriteId) return o
    }
}

//the scene is already implied since this client will not have any objects existing except from the scene they are already in
function GetSpritesInRange(obj, range, excludeSelf){
    let near = []
    for(let i in allSprites){
        let sprite = allSprites[i]
        if(!sprite) continue
        if(excludeSelf && obj == sprite) continue
        if(Phaser.Math.Distance.Between(obj.x, obj.y, sprite.x, sprite.y) <= range) near.push(sprite)
    }
    return near
}

function GetPlayersInRange(obj, range, excludeSelf){
    let near = []
    if(!obj || !obj.body) return near //* when you delete a sprite the body goes away but the sprite reference stays for a while it really sucks so to check if it really still exists we need to ignore it if it has no body also or we get runtime errors like 'no .position var on sprite'
    for(let i in players){
        let sprite = players[i]
        if(!sprite || !sprite.body) continue
        if(excludeSelf){
            if(obj == sprite) continue
            if(obj.isAPlayer && obj.playerSlot == sprite.playerSlot) continue
        }
        if(Phaser.Math.Distance.Between(obj.x, obj.y, sprite.x, sprite.y) <= range) near.push(sprite)
    }
    return near
}

function GetEntitiesInRange(obj, range, excludeSelf){
    let near = []
    if(!obj || !obj.body) return near //* when you delete a sprite the body goes away but the sprite reference stays for a while it really sucks so to check if it really still exists we need to ignore it if it has no body also or we get runtime errors like 'no .position var on sprite'
    for(let i in entities){
        let sprite = entities[i]
        if(!sprite || !sprite.body) continue
        if(excludeSelf){
            if(obj == sprite) continue
            if(obj.isAPlayer && obj.playerSlot == sprite.playerSlot) continue
        }
        if(Phaser.Math.Distance.Between(obj.x, obj.y, sprite.x, sprite.y) <= range) near.push(sprite)
    }
    return near
}

//get distance between 2 sprites
function SpriteDistance(s1, s2){
    return Phaser.Math.Distance.Between(s1.x, s1.y, s2.x, s2.y)
}

function SendToRandomVoid(s){
    //when i upped it to 100k it lagged so bad
    //ok even 10k seems laggy
    let x = Math.random() * 1500 + 500
    let y = Math.random() * 1500 + 500
    SetPosition(s, -x, -y)
}

function AbsLookAngle(s1, s2){
    return Math.abs(LookAngle(s1, s2))
}

//get an angle representing how far one sprite is from perfectly looking at another, perfectly looking at them is 0 angle, facing the opposite direction would be 180
function LookAngle(s1, s2){
    let ang1 = s1.angle
    let ang2 = Phaser.Math.RadToDeg(Phaser.Math.Angle.BetweenPoints(s1, s2))
    let lookAngle = Phaser.Math.Angle.ShortestBetween(ang1, ang2)
    return lookAngle
}

//. never use the built in sprite.setVelocity, use this as a wrapper instead because it will auto wake-up the sprite if it is sleeping. otherwise a sleeping sprite will not respond at all to sprite.setVelocity and therefore not move
function SetVelocity(s, x, y){
    if(x != 0 || y != 0) SetSleeping(s, false)
    s.setVelocity(x, y)

}

function SetPosition(s, x, y){
    if(x != s.x || y != s.y) SetSleeping(s, false)
    s.setPosition(x, y)
}

//the matter docs say that simply setting body.isSleeping is not good enough. you must use this function
function SetSleeping(s, b){
    if(!s || !s.body) return
    Phaser.Physics.Matter.Matter.Sleeping.set(s.body, b)
}

//test if body1 is overlapping body2
function Overlapping(body1, body2){
    if(!body1 || !body2) return false
    if(Phaser.Physics.Matter.Matter.Bounds.overlaps(body1.bounds, body2.bounds)) return true
    return false
}
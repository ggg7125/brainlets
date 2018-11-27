//. THIS IS ONLY FOR CODE THAT WORK FOR CLIENT AND SERVER. for one or the other, use the clientUtils or serverUtils files for things that dont work for both

module.exports = {
    remove: remove,
    GameVersion: GameVersion,
    HashCode: HashCode,
    ByteCount: ByteCount,
    msg: GetMsg,
    CompressAngle: CompressAngle,
    DecompressAngle: DecompressAngle,
    DecompressAngleToRadian: DecompressAngleToRadian,
    CompressPosition: CompressPosition,
    CompressFloat: CompressFloat,
    DecompressFloat: DecompressFloat,
    CompressAlpha: CompressAlpha,
    DecompressAlpha: DecompressAlpha,
    Radian2Vector: Radian2Vector,
    layers: GetLayers,
    Pick: Pick,
    netvarTo: NetVarTo,
    CloneObject: CloneObject,
    angleLerp: angleLerp,
    Distance: Distance,
}

var gameVersion = 0 //only clients and servers of the same version will be allowed to connect

function GameVersion(){
    return gameVersion
}

//. an enum defining who a netvar should be sent to
const netvarTo = {
    player: 0,
    everyone: 1,
    server: 2,
    range: 3,
    authority: 4,
}

function NetVarTo(){
    return netvarTo
}

//. the enum of network message types
const msg = {
    spritePosUpdate: 0,
    spriteAngUpdate: 1,
    sendInRange: 2,
    netSpawn: 3,    
    destroySprite: 4,
    explosion: 5,
    sleep: 6, //sleep & wake occur on switching tabs and coming back to a tab
    wake: 7,
    latencyUpdate: 8,
    chatMessage: 9,
    shieldOn: 10, //. check all these shield messages, i think some/all are defunct now with the new ability system
    shieldOff: 11,
    shieldBreak: 12,
    setShieldHealth: 13,
    setPosition: 14, //directly set the position of a sprite. teleporting pretty much
    reportRoomInfo: 15,
    authorityBossCheck: 16, //when a new player logs in the authority will make them the Boss if there is none
    knockback: 17,
    firstPlayerJoinedRoom: 18, //when the first player (and by default first authority) joins a room, nothing exists yet, this message tells them to spawn the first npcs and other initialization of things
    tryGetPowerGem: 19,    
    netvar: 20,
    storedData: 21, //storedData on the server is being sent to the new authority due to an authority change
    destroySpriteOnRelay: 22,
    removeNonexistantsFromStoredData: 23, //remove references to nonexistant entities from the storedData on the relay server when authority changes
    
    //* BEGIN ABILITY CODES
    abilityMelee: 24,
    abilityShield: 25,
    abilityBlast: 26,
    abilityRapidBlast: 27,
    abilityBow: 28,
    abilityWizardAoE: 29,
    abilitySword: 30,
    //* END ABILITY CODES

    assignGemHolder: 50,
    requestPowerGemData: 51,
    netSpawnFor: 52,
    removePowerGemFrom: 53,
    givePowerGemData: 54,

    //* BEGIN HAT CODES
    barbarianHat: 100,
    mageHat: 101,
    gokuHat: 102,
    killuaHat: 103,
    brainletHat: 104,
    //* END HAT CODES
    
    requestPower: 200,
    requestDurability: 201,
    requestSpeed: 202,
    requestStamina: 203,
    requestVitality: 204,
    requestSpirit: 205,
}

function GetMsg(){
    return msg
}

const layers = {
    background: 0,
    map: 1,
    map2: 2,
    map3: 3,
    map4: 4,
    map5: 5,
    map6: 6,
    obj: 7,
    obj2: 8,
    obj3: 9,
    obj4: 10,
    entity: 11,
    entity2: 12,
    entity3: 13,
    entity4: 14,
    trees: 15,
    trees1: 16,
    trees2: 17,
    trees3: 18,
    ui: 19,
    ui1: 20,
    ui2: 21,
    ui3: 22,
}

function GetLayers(){
    return layers
}

//i copied this function straight out of the phaser source
function Distance(x1, y1, x2, y2){
    let dx = x1 - x2
    let dy = y1 - y2
    return Math.sqrt(dx * dx + dy * dy)
}

//for some reason javascript has no good way to remove a certain item from an array so we now have this
function remove(arr, item){
    for(var i = arr.length; i--;){
        if(arr[i] === item){
            arr.splice(i,1)
            break
        }
    }
    return arr
}

//compress an angle to a number best suited for sending over the network (0-255)
//. make sure never to pass a radian instead of an angle or it will be incorrect
function CompressAngle(angle){
    //sprite.angle is always -180 to 180 so we convert to 0 360
    angle += 180
    angle = Math.round(angle / 360 * 255) //compress it to 0-255
    return angle
}

function DecompressAngle(ang){
    ang = ang / 255 * 360
    ang -= 180 //sprite.angle is always -180 to 180 so we want to also be -180 to 180 so we can assign natively
    return ang
}

//turn a compressed angle back into a RADIAN that can be assigned normally
function DecompressAngleToRadian(ang){
    ang = ang / 255 * 360
    ang -= 180
    let RADIAN = Phaser.Math.DegToRad(ang)
    return RADIAN
}

function CompressPosition(x, y){
    let pos = [Math.round(x), Math.round(y)]
    return pos
}

var floatCompressMult = 1000

function CompressFloat(f){
    return Math.round(f * floatCompressMult)
}

function DecompressFloat(f){
    return f / floatCompressMult
}

function CompressAlpha(a){ //Phaser uses a alpha float between 0 and 1. but we convert it to an integer between 0 and 100 for sending over the network
    return Math.round(a * 100)
}

function DecompressAlpha(a){
    return a / 100
}

//. turn a string to an integer that is unique except for like 1 out of 1 billion times
function HashCode(str) {
    return str.split('').reduce((prevHash, currVal) => (((prevHash << 5) - prevHash) + currVal.charCodeAt(0))|0, 0)
}

//. for strings only
function ByteCount(str) {
    return encodeURI(str).split(/%..|./).length - 1
}

//essentially Angle to Vector but it uses radians
function Radian2Vector(r){
    //the vector returned will always be magnitude 1
    r = Phaser.Math.Angle.Wrap(r)
    return [Math.cos(r), Math.sin(r)] //we return an array instead of a vector as creating new vectors every time is slow
}

function Pick(list){
    return list[Math.floor(Math.random() * list.length)]
}

//* we are mostly using this to clone dictionaries, because if you have a dictionary named var1, and set var2 = var1, we are used to it created a COPY. but in javascript its a direct reference. if i change var2.value = something then var1.value is going to change itself too. because they're really the same object.
function CloneObject(object){
    //return Object.assign({}, object) //our attempt to make something faster than stringify but its a shallow copy whereas stringify is a deep copy - so idk if that will be a problem yet
    //return {...object} //another attempt to make something faster than stringify - never tested if this works
    //. the below works but its pretty slow i think the slowest think in the game with how often and on how many objects netvar updates have to loop on
    return JSON.parse(JSON.stringify(object))
}

//. seems to be radians?
function shortAngleDist(a0,a1) {
    var max = Math.PI * 2
    var da = (a1 - a0) % max
    return 2 * da % max - da
}

//. seems to take radians?
//* this is a more proper lerp than Phaser.Math.Angle.RotateTo
function angleLerp(a0,a1,t) {
    return a0 + shortAngleDist(a0,a1)*t;
}
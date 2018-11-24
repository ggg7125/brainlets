import { socket, authority } from "./client";
import { player } from "./sceneTest";
var utils = require('../utils')
var clientUtils = require('./clientUtils')

export var hat //this local player's Hat class that they are currently wearing
export var allHats

setTimeout(() => {
    allHats = [new BarbarianHelmet(), new MageHat(), new GokuHat(), new KilluaHat(), new BrainletHat()]

    socket.on(utils.msg().barbarianHat, function(data){
        let msg = utils.msg().barbarianHat //. make sure these match!!
        ReceiveHatMessage(msg, data)
    })
    socket.on(utils.msg().mageHat, function(data){
        let msg = utils.msg().mageHat //. make sure these match!!
        ReceiveHatMessage(msg, data)
    })
    socket.on(utils.msg().gokuHat, function(data){
        let msg = utils.msg().gokuHat //. make sure these match!!
        ReceiveHatMessage(msg, data)
    })
    socket.on(utils.msg().killuaHat, function(data){
        let msg = utils.msg().killuaHat //. make sure these match!!
        ReceiveHatMessage(msg, data)
    })
    socket.on(utils.msg().brainletHat, function(data){
        let msg = utils.msg().brainletHat //. make sure these match!!
        ReceiveHatMessage(msg, data)
    })
}, 10);

export function ReceiveHatMessage(msg, data){
    if(socket.id != authority) return
    //data is either just a playerSlot, indicating an unequip, or an array of [playerSlot, 1], indicating an equip
    //. if its an array that indicates equip
    if(Array.isArray(data)){
        let playerSlot = data[0]
        let s = clientUtils.GetPlayerBySlot(playerSlot)
        if(!s) return
        let h = GetHatByCode(msg)
        h.ApplyHatStats(s, 1)
    }
    //. otherwise unequip
    else{
        let playerSlot = data
        let s = clientUtils.GetPlayerBySlot(playerSlot)
        if(!s) return
        let h = GetHatByCode(msg)
        h.ApplyHatStats(s, -1)
    }
}

export function GetHatByCode(code){
    for(let o of allHats){
        if(o.hatCode == code) return o
    }
}

export function EquipHatByCode(code){
    let h = GetHatByCode(code)
    h.Equip()
}

export class Hat{
    constructor(){
        this.hatCode = null //example: utils.msg().barbarianHat
        this.hatOverlay = 'fighterHat'
        this.hatAbilities = [] //. a list of Ability class instances that this hat provides. example: [new Ability1(), new Ability2()]. hat abilities are then used with buttons 0-9
    }

    Equip(){
        if(hat && hat.hatCode == this.hatCode) return //same hat you already wearing
        if(hat) hat.Unequip()
        player.AddOverlay(this.hatOverlay) //. reminder: AddOverlay now only lets you add to a sprite who already owns its overlays netvar. so we dont have to think about it anymore
        socket.emit(this.hatCode, 1) //* we have to tell the authority so that the hat's stats can be applied onto the authority character
        hat = this
    }

    Unequip(){
        if(!hat || hat.hatCode != this.hatCode) return //if you arent wearing a hat, or your wearing a hat that isnt even this hat...then you cant unequip this hat
        player.RemoveOverlay(this.hatOverlay)
        socket.emit(this.hatCode)
        hat = null
    }

    //. hat stats must be applied on the authority thats why you dont see it being called in Equip() or any other local code
    ApplyHatStats(s, n){
        if(!n) return
        //. 1 = add stats. -1 = subtract stats.
        //* reminder: this function affects the local player only so dont overthink it
    }
}

export class BarbarianHelmet extends Hat{
    constructor(){
        super()
        this.hatCode = utils.msg().barbarianHat
        this.hatOverlay = 'fighterHat'
    }

    ApplyHatStats(s, n){
        super.ApplyHatStats(s, n)
        s.StatLevel('durabilityStat', 4 * n, false)
    }
}

export class MageHat extends Hat{
    constructor(){
        super()
        this.hatCode = utils.msg().mageHat
        this.hatOverlay = 'mageHat'
    }

    ApplyHatStats(s,n){
        super.ApplyHatStats(s,n)
        s.StatLevel('spiritStat', 5 * n, false)
    }
}

export class GokuHat extends Hat{
    constructor(){
        super()
        this.hatCode = utils.msg().gokuHat
        this.hatOverlay = 'gokuHair'
    }

    ApplyHatStats(s,n){
        super.ApplyHatStats(s,n)
        s.StatLevel('powerStat', 2 * n, false)
        s.StatLevel('speedStat', 2 * n, false)
        s.StatLevel('durabilityStat', 2 * n, false)
    }
}

export class KilluaHat extends Hat{
    constructor(){
        super()
        this.hatCode = utils.msg().killuaHat
        this.hatOverlay = 'killuaHair'
    }

    ApplyHatStats(s,n){
        super.ApplyHatStats(s,n)
        s.StatLevel('speedStat', 6 * n, false)
    }
}

export class BrainletHat extends Hat{
    constructor(){
        super()
        this.hatCode = utils.msg().brainletHat
        this.hatOverlay = 'brainletHat'
    }

    ApplyHatStats(s,n){
        super.ApplyHatStats(s,n)
        s.StatLevel('durabilityStat', 3 * n, false)
        s.StatLevel('vitalityStat', 10 * n, false)
    }
}
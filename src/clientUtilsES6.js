import { game } from "./index";
import { Distance } from "../utilsES6";
import { socket, authority } from "./client";
import { Explosion } from "./classes";

var utils = require('../utils')

//* we are having to make this script because module.exports is not compatible with using es6 import/export and from now on we want to use es6 as its proving more flexible and lets us access things easier in other scripts and we are having so many problems with the old style scripts that use module.exports being unable to access certain data its a real brick wall and annoying so here we are. it would be nice to eventually transfer all the code to es6 but for now oh well too much work

export function InSafeZone(x, y){
    if(Distance(x, y, game.scene.scenes[1].worldBoundsX / 2, game.scene.scenes[1].worldBoundsY / 2) < 750) return true
    return false
}

export function NetExplosion(x, y, size){
    if(socket.id != authority) return
    socket.emit(utils.msg().explosion, [x, y, size])
    LocalExplosion(x, y, size)
}

export function LocalExplosion(x, y, size){
    let config = {
        scene: game.scene.scenes[1],
        key: 'explosion',
    }
    let e = new Explosion(config)
    e.setPosition(x, y)
    e.setScale(size)
    e.anims.play('explosion')
    setTimeout(function(){
        e.destroy()
    }, 2000)
}
//. NPC Attacks are completely different (check the NPC classes in classes.js), because they have to be, because:
//.1) they all attack on the authority, no need to do any emits because there is no animation or anything to show on all sides, they just damage their health on the authority, and we already have code that sends health changes, so thats all thats needed.
//.2) with NPCs there is no need to create a projectile that causes the damage, that would be inefficient, they just do a range check then damage their target if in range.

import {spawnableClasses} from './classes'
var clientUtils = require('./clientUtils')

export var bulletCache = []

export function GetBullet(className){
    let bullets = bulletCache[className]
    if(bullets && bullets.length){
        let b = bullets.shift() //simultaneously removes the first element from the list and returns it
        b.creationTime = Date.now()
        clientUtils.SetSleeping(b, false)
        b.cached = false
        b.setActive(true)
        b.setVisible(true)
        return b
    }
    else{
        let b = new spawnableClasses[className]()
        b.creationTime = Date.now()
        return b
    }
}
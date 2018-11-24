//* getting really annoyed with the limitations of the old non-es6 module.exports thing...we are going full es6 now but moving the old code to es6 is going to have to be a gradual process its too much to do all at once

//i copied this function straight out of the phaser source
export function Distance(x1, y1, x2, y2){
    let dx = x1 - x2
    let dy = y1 - y2
    return Math.sqrt(dx * dx + dy * dy)
}
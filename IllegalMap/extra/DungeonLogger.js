import Dungeon from "../../BloomCore/dungeons/Dungeon";
import { fn, getServerID } from "../../BloomCore/utils/Utils";
import Config from "../data/Config";
import { dmapData, getRoomsFile, prefix } from "../utils";
import DmapDungeon from "../Components/DmapDungeon";

let logged = false

const exclusions = ["Entrance", "Fairy", "Blood", "Unknown"]
const traps = ["New", "Old"]
const defaultFile = {"dungeons":[]}

const getRoomID = (roomName) => getRoomsFile().rooms.filter(a => a.name == roomName)[0]?.roomID
const getRoomFromID = (roomID) => getRoomsFile().rooms.filter(a => a.roomID == roomID)[0]

const convertToLog = (log) => {
    // Converts all of the rooms to indexed versions - reduces the space that the json file takes up.
    // Can be fucked if the rooms.json file order is changed though but idk a better way to do it lol
    log.r = log.r.map(a => getRoomID(a))
    log.p = log.p.map(a => getRoomID(a))
    log.t = traps.indexOf(log.t)
    return log
}

const getLogs = () => JSON.parse(FileLib.read("IllegalMap", "data/dungeonLogs.json"))

const addLog = (data) => {
    let logs = getLogs()
    if (!logs || !logs.dungeons) {
        logs = defaultFile
    }
    logs.dungeons.push(data)
    FileLib.write("IllegalMap", "data/dungeonLogs.json", JSON.stringify(logs))
}

register("tick", () => {
    if (!Config.logDungeons || logged || !Dungeon.inDungeon || !DmapDungeon.fullyScanned) return
    if (!Dungeon.floor || DmapDungeon.witherDoors < 1 || !DmapDungeon.trapType) return
    if (DmapDungeon.rooms.some(a => !a.name)) return
    logged = true
    let server = getServerID()
    if (!server || server == dmapData.lastLogServer) return
    dmapData.lastLogServer = server
    dmapData.save()
    let thisLog = {
        "f": Dungeon.floor, // Floor
        "s": DmapDungeon.secrets, // Secrets
        "wd": DmapDungeon.witherDoors - 1, // Wither Doors
        "r": [...new Set(DmapDungeon.rooms.filter(a => !["puzzle", "yellow", "trap"].includes(a.type) || !a.type).map(b => b.name).filter(c => !exclusions.includes(c)))], // Rooms
        "p": DmapDungeon.rooms.filter(a => a.type == "puzzle").map(b => b.name), // Puzzles
        "t": DmapDungeon.trapType // Trap type
    }
    thisLog = convertToLog(thisLog)
    addLog(thisLog)
})

register("command", (floor) => {
    let logs = getLogs()?.dungeons ?? []
    logs = !floor ? logs : logs.filter(a => a.f == floor.toUpperCase())

    if (!logs.length) {
        return ChatLib.chat(`${prefix} &cNo dungeons logged on &b${floor ?? "Any Floor"}&c!`)
    }
    let s = logs.map(a => a.s).sort((a, b) => a - b) // Secrets
    let wd = logs.map(a => a.wd) // Wither Doors
    let p = logs.map(a => a.p.length) // Puzzles
    floor = floor ? floor.toUpperCase() : "All Floors"
    
    const sc = (msg) => ChatLib.getCenteredText(msg) // Center chat (Lazy to type)

    // Sort rooms from most to least common (Made function so it can be used on both regular rooms and puzzles)
    const sortFrequency = (flatArray) => {
        // Get the amount of times each room appears as an object {"1": 20, "2": 24...}
        let counts = {}
        for (let v of flatArray) {
            if (Object.keys(counts).includes(v)) {
                counts[v]++
                continue
            }
            counts[v] = 1
        }
        // Sort the object by value (https://stackoverflow.com/questions/1069666/sorting-object-property-by-values) and reverse it so the most common rooms are at the start
        let sorted = []
        for (let a in counts) sorted.push([a, counts[a]])
        return sorted.sort((a, b) => a[1] - b[1]).reverse()
    }

    // Get all of the rooms from the logs into a single 1d array (Thanks field_150360_v in CT discord for helping with this)
    let allRooms = [].concat(...logs.map(l => l.r)).map(a => a?.toString())
    let allPuzzles = [].concat(...logs.map(l => l.p)).map(a => a?.toString())
    let allFloors = logs.map(l => l.f)
    let sortedRooms = sortFrequency(allRooms)
    let sortedPuzzles = sortFrequency(allPuzzles)
    let sortedFloors = sortFrequency(allFloors)

    // Gets the first <amount> elements in <array> and makes a list of them. if <isRooms> is true then it'll convert room indexes into the respective room name.
    // if <showPercentage> is set to True then show what percent of total each value is
    const getTopX = (array, amount, title, isRooms, showPercentage) => {
        let text = title
        for (let i = 0; i < (amount == -1 ? array.length : amount > array.length ? array.length : amount); i++) {
            text += `\n&6#${i+1}&a - &b${isRooms ? getRoomFromID(array[i][0])?.name ?? "idk" : array[i][0]}&a: ${fn(array[i][1])}`
            text += showPercentage ? ` &8(${Math.floor((array[i][1]/logs.length)*10000)/100}%)` : ""
        }
        return text
    }

    const makeHoverMsg = (text, hover) => new Message(new TextComponent(text).setHover("show_text", hover))

    let roomsHoverMax = getTopX(sortedRooms, 30, "&aMost common rooms found", true, true) // Top 10 most common rooms
    let roomsHoverMin = getTopX(sortedRooms.reverse(), 30, "&eRarest rooms found", true, true) // 10 rarest rooms found
    let puzzleHover = getTopX(sortedPuzzles, -1, "&dPuzzles", true, true) // All puzzles sorted from most to least frequent

    // Dungeon floors played (If showing stats for all floors)
    let runsLoggedMsg = floor == "All Floors" ? makeHoverMsg(sc(`&dRuns Logged: &b${fn(logs.length)}`), getTopX(sortedFloors, -1, "&aFloors", false)) : sc(`&dRuns Logged: &b${fn(logs.length)}`)

    if (floor == "All Floors") ChatLib.chat(`&3--------------------- &bStats for &aAll Floors &3----------------------`)
    else ChatLib.chat(`&3------------------------- &bStats for &a${floor} &3-------------------------`)
    ChatLib.chat(runsLoggedMsg)
    ChatLib.chat(makeHoverMsg(sc(`&fAverage Secrets: &b${Math.round(s.reduce((a, b) => a + b ) / s.length * 10) / 10}`), `&eSecrets\n&aLeast: ${s[0]}\n&cMost: ${s[s.length-1]}\n&bTotal: ${fn(s.reduce((a, b) => a + b))}`))
    ChatLib.chat(sc(`&7Average Wither Doors: &8${Math.round(wd.reduce((a, b) => a + b) / wd.length * 10) / 10}`))
    ChatLib.chat(makeHoverMsg(sc(`&dAverage Puzzles: &b${Math.round(p.reduce((a, b) => a + b) / p.length * 10) / 10}`), puzzleHover))
    ChatLib.chat(makeHoverMsg(sc(`&aCommon Rooms &7(Hover)`), roomsHoverMax))
    ChatLib.chat(makeHoverMsg(sc(`&eRarest Rooms &7(Hover)`), roomsHoverMin))
    ChatLib.chat(`&3${ChatLib.getChatBreak("-")}`)
}).setName("dlogs")

register("worldUnload", () => {
    logged = false
})
local frame = 0
local armed = false
local pollFrame = 0
local requestPath = os.getenv("FLYCAST_RYO_PROBE_REQUEST")
    or ".flycast-pvr/control/ryo-hallway-probe.request"
local matrixRequestPath = os.getenv("FLYCAST_RYO_MATRIX_REQUEST")
    or ".flycast-pvr/control/ryo-matrix-recording.request"
local longWalkRequestPath = os.getenv("FLYCAST_RYO_LONG_WALK_REQUEST")
    or ".flycast-pvr/control/ryo-long-walk-recording.request"
local drawerRequestPath = os.getenv("FLYCAST_DRAWER_RECORDING_REQUEST")
    or ".flycast-pvr/control/drawer-recording.request"
local objectOnceRequestPath = os.getenv("FLYCAST_OBJECT_ONCE_RECORDING_REQUEST")
    or ".flycast-pvr/control/object-once-recording.request"
local inputPulseRequestPath = os.getenv("FLYCAST_INPUT_PULSE_REQUEST")
    or ".flycast-pvr/control/input-pulse.request"
local raceRouteRequestPath = os.getenv("FLYCAST_RACE_ROUTE_REQUEST")
    or ".flycast-pvr/control/race-route-recording.request"
local boundaryRequestPath = os.getenv("FLYCAST_BOUNDARY_REQUEST")
    or ".flycast-pvr/control/boundary-transition-recording.request"
local memoryWriteRequestPath = os.getenv("FLYCAST_MEMORY_WRITE_REQUEST")
    or ".flycast-pvr/control/memory-write.request"
local s2ActorCaptureRequestPath = os.getenv("FLYCAST_S2_ACTOR_CAPTURE_REQUEST")
    or ".flycast-pvr/control/s2-animation-actor-capture.request"
local frameCaptureRequestPath = os.getenv("FLYCAST_FRAME_CAPTURE_REQUEST")
    or ".flycast-pvr/control/frame-capture.request"
local exitAfterS2ActorCapture =
    os.getenv("FLYCAST_EXIT_AFTER_S2_ACTOR_CAPTURE") == "1"
local matrixOutputRoot = os.getenv("FLYCAST_RYO_MATRIX_OUTPUT")
    or "captures/skeleton"
local raceRouteOutputRoot = os.getenv("FLYCAST_RACE_ROUTE_OUTPUT")
    or "captures/race"
local boundaryOutputRoot = os.getenv("FLYCAST_BOUNDARY_OUTPUT")
    or "captures/boundary"
local matrixBase = 0x8cc06e80
local matrixCount = 37
local matrixWords = 16
local matrixStride = 0x40
local controlBase = 0x8cc05820
local controlCount = 37
local controlWords = 18
local controlStride = 0x48
local matrixRecording = nil
local drawerRecording = nil
local inputPulse = nil
local repeatedMemoryWrites = nil
local s2ActorCapture = nil
local frameCapture = nil
local raceRouteRecording = nil
local boundaryRecording = nil
local dpadUp = 0x10
local controlledDpadButtons = dpadUp
local buttonA = 0x4
local buttonB = 0x2
local drawerMemoryBase = 0x8c810000
local drawerMemoryBytes = 0x3000
local drawerMemoryWords = drawerMemoryBytes / 4
local raceForkliftTasks = {
    0x8c87e240,
    0x8c87e960,
    0x8c87ef80,
    0x8c87f5a0,
    0x8c87fbc0
}
local jd00RyoTask = 0x8c5a0b40
local jd00EventWatcher = 0x8c5aef00
local jd00SelectorWord = 0x8c43fa04
local fieldManagerGlobal = 0x8c2020cc

local function consumeRequest(path)
    local request = io.open(path, "r")
    if not request then
        return false
    end
    request:close()
    os.remove(path)
    return true
end

local function consumeObjectRequest(path)
    local request = io.open(path, "r")
    if not request then
        return nil
    end
    local line = request:read("*l") or ""
    request:close()
    os.remove(path)
    local requestedBase, requestedBytes, loadState, inputButtons,
        inputStartFrame, inputFrames = line:match(
        "^(%S+)%s+(%S+)%s*(%S*)%s*(%S*)%s*(%S*)%s*(%S*)"
    )
    return {
        memoryBase = tonumber(requestedBase) or drawerMemoryBase,
        memoryBytes = tonumber(requestedBytes) or drawerMemoryBytes,
        loadState = loadState == "" or loadState == nil
            or tonumber(loadState) ~= 0,
        inputButtons = tonumber(inputButtons) or buttonA,
        inputStartFrame = tonumber(inputStartFrame) or 61,
        inputFrames = tonumber(inputFrames) or 15
    }
end

local function consumeInputPulseRequest(path)
    local request = io.open(path, "r")
    if not request then
        return nil
    end
    local line = request:read("*l") or ""
    request:close()
    os.remove(path)
    local port, buttons, frames, loadState, axisX, axisY, triggerLeft,
        triggerRight = line:match(
        "^(%S+)%s+(%S+)%s+(%S+)%s+(%S+)%s*(%S*)%s*(%S*)%s*(%S*)%s*(%S*)"
    )
    if not port then
        print("[INPUT_PULSE] invalid request: " .. line)
        return nil
    end
    return {
        port = tonumber(port) or 1,
        buttons = tonumber(buttons) or 0,
        frames = math.max(1, tonumber(frames) or 1),
        loadState = tonumber(loadState) or -1,
        axisX = tonumber(axisX) or 0,
        axisY = tonumber(axisY) or 0,
        triggerLeft = tonumber(triggerLeft) or 0,
        triggerRight = tonumber(triggerRight) or 0
    }
end

local function consumeMemoryWriteRequest(path)
    local request = io.open(path, "r")
    if not request then
        return nil
    end
    local requestData = {
        frames = 1,
        writes = {}
    }
    for line in request:lines() do
        local frames = line:match("^frames%s+(%S+)")
        local address, value = line:match("^(%S+)%s+(%S+)")
        if frames then
            requestData.frames = math.max(1, tonumber(frames) or 1)
        elseif address and value then
            requestData.writes[#requestData.writes + 1] = {
                address = tonumber(address),
                value = tonumber(value)
            }
        end
    end
    request:close()
    os.remove(path)
    return requestData
end

local function consumeS2ActorCaptureRequest(path)
    local request = io.open(path, "r")
    if not request then
        return nil
    end
    local requestData = {
        actorCode = nil,
        addresses = {},
        targets = {},
        captureCount = 12,
        captureSpacing = 6,
        timeoutFrames = 216000,
        acquisitionTaskAddress = nil
    }
    for line in request:lines() do
        local key, value, extra = line:match("^(%S+)%s+(%S+)%s*(%S*)")
        if key == "actor" then
            requestData.actorCode = value
        elseif key == "address" then
            requestData.addresses[#requestData.addresses + 1] = tonumber(value)
        elseif key == "target" and extra ~= "" then
            local target = nil
            for _, candidate in ipairs(requestData.targets) do
                if candidate.actorCode == value then
                    target = candidate
                    break
                end
            end
            if not target then
                target = { actorCode = value, addresses = {}, completed = false }
                requestData.targets[#requestData.targets + 1] = target
            end
            target.addresses[#target.addresses + 1] = tonumber(extra)
        elseif key == "captures" then
            requestData.captureCount = math.max(1, tonumber(value) or 12)
        elseif key == "spacing" then
            requestData.captureSpacing = math.max(1, tonumber(value) or 6)
        elseif key == "timeout" then
            requestData.timeoutFrames = math.max(30, tonumber(value) or 216000)
        elseif key == "acquisition-task" then
            requestData.acquisitionTaskAddress = tonumber(value)
        end
    end
    request:close()
    os.remove(path)
    if requestData.actorCode and #requestData.addresses > 0 then
        requestData.targets[#requestData.targets + 1] = {
            actorCode = requestData.actorCode,
            addresses = requestData.addresses,
            completed = false
        }
    end
    if #requestData.targets == 0 then
        print("[S2_ACTOR_CAPTURE] invalid request")
        return nil
    end
    return requestData
end

local function consumeFrameCaptureRequest(path)
    local request = io.open(path, "r")
    if not request then
        return nil
    end
    local requestData = {
        captureCount = 1,
        captureSpacing = 1
    }
    for line in request:lines() do
        local key, value = line:match("^(%S+)%s+(%S+)")
        if key == "captures" then
            requestData.captureCount = math.max(1, tonumber(value) or 1)
        elseif key == "spacing" then
            requestData.captureSpacing = math.max(1, tonumber(value) or 1)
        end
    end
    request:close()
    os.remove(path)
    return requestData
end

local function startFrameCapture(requestData)
    frameCapture = requestData
    frameCapture.frame = 0
    frameCapture.captured = 0
    frameCapture.nextCaptureFrame = 1
    print(string.format(
        "[FRAME_CAPTURE] requesting %d synchronized frames, spacing=%d",
        frameCapture.captureCount,
        frameCapture.captureSpacing
    ))
end

local function recordFrameCapture()
    frameCapture.frame = frameCapture.frame + 1
    if frameCapture.frame < frameCapture.nextCaptureFrame then
        return
    end
    frameCapture.captured = frameCapture.captured + 1
    flycast.capture.requestFrame()
    print(string.format(
        "[FRAME_CAPTURE] requested frame %d/%d",
        frameCapture.captured,
        frameCapture.captureCount
    ))
    if frameCapture.captured >= frameCapture.captureCount then
        print("[FRAME_CAPTURE] complete")
        frameCapture = nil
    else
        frameCapture.nextCaptureFrame = (
            frameCapture.frame + frameCapture.captureSpacing
        )
    end
end

local function validS2Controller(address)
    if address < 0x8c000000 or address + 0x2440 > 0x8d000000 then
        return false
    end
    local slotFlags = flycast.memory.readTable32(address + 0x23c0, 3)
    local currentMotions = flycast.memory.readTable32(address + 0x2400, 3)
    local flags01 = slotFlags[address + 0x23c0]
    local flags23 = slotFlags[address + 0x23c4]
    local motions01 = currentMotions[address + 0x2400]
    local motions23 = currentMotions[address + 0x2404]
    return flags01 == 0x000c000c
        and flags23 == 0x000c000c
        and motions01 ~= 0
        and motions01 % 0x10000 == math.floor(motions01 / 0x10000)
        and motions23 % 0x10000 == math.floor(motions23 / 0x10000)
        and motions01 % 0x10000 == motions23 % 0x10000
end

local function liveS2ActorController(recordAddress)
    local pointers = flycast.memory.readTable32(recordAddress + 0x08, 8)
    local first = pointers[recordAddress + 0x08]
    local duplicate = pointers[recordAddress + 0x24]
    if first == duplicate and validS2Controller(first) then
        return first
    end
    return nil
end

local function validS2ScheduledActorRecord(recordAddress)
    local fields = flycast.memory.readTable32(recordAddress + 0x18, 205)
    local owner = fields[recordAddress + 0x18]
    local program = fields[recordAddress + 0x348]
    return owner >= 0x8c000000 and owner < 0x8d000000
        and program >= 0x8c000000 and program < 0x8d000000
end

local function setIntegerFlag(value, flag)
    if math.floor(value / flag) % 2 == 0 then
        return value + flag
    end
    return value
end

local function clearIntegerFlag(value, flag)
    if math.floor(value / flag) % 2 == 1 then
        return value - flag
    end
    return value
end

local function prepareS2ActorForNativeAcquisition()
    local taskAddress = s2ActorCapture.acquisitionTaskAddress
    if not taskAddress then
        return
    end
    for _, target in ipairs(s2ActorCapture.targets) do
        if not target.completed then
            for _, address in ipairs(target.addresses) do
                if validS2ScheduledActorRecord(address) then
                    local taskPosition = flycast.memory.readTable32(
                        taskAddress + 0x28,
                        3
                    )
                    local actorFlags = flycast.memory.readTable32(
                        address + 0x2d8,
                        1
                    )[address + 0x2d8]
                    local eligibility = flycast.memory.readTable32(
                        address + 0x9c,
                        1
                    )[address + 0x9c]
                    -- Xbox FUN_00060397 normally rejects bit 0x00800000.
                    -- The global loader state machine accepts bit 0x01 as an
                    -- active request and bit 0x08 as its native capacity
                    -- override. FUN_0005a925 accepts actor +0x9c bit 0x10.
                    -- Region 0x10000 tells FUN_00061e20 to use the current
                    -- map's ground query. These are capture-local eligibility
                    -- inputs; identity, resource lookup, controller creation,
                    -- motion evaluation, and solver output remain native.
                    actorFlags = clearIntegerFlag(actorFlags, 0x00800000)
                    actorFlags = setIntegerFlag(actorFlags, 0x01)
                    actorFlags = setIntegerFlag(actorFlags, 0x08)
                    eligibility = setIntegerFlag(eligibility, 0x10)
                    flycast.memory.write32(address + 0x2d8, actorFlags)
                    flycast.memory.write32(address + 0x9c, eligibility)
                    flycast.memory.write32(address + 0x2f8, 0x10000)
                    flycast.memory.write32(
                        address + 0x36c,
                        taskPosition[taskAddress + 0x28]
                    )
                    flycast.memory.write32(
                        address + 0x370,
                        taskPosition[taskAddress + 0x2c]
                    )
                    flycast.memory.write32(
                        address + 0x374,
                        taskPosition[taskAddress + 0x30]
                    )
                    return
                end
            end
        end
    end
end

local function startS2ActorCapture(requestData)
    s2ActorCapture = requestData
    s2ActorCapture.frame = 0
    s2ActorCapture.captured = 0
    local recordCount = 0
    for _, target in ipairs(s2ActorCapture.targets) do
        recordCount = recordCount + #target.addresses
    end
    print(string.format(
        "[S2_ACTOR_CAPTURE] watching %d records for %d targets",
        recordCount,
        #s2ActorCapture.targets
    ))
end

local function recordS2ActorCapture()
    s2ActorCapture.frame = s2ActorCapture.frame + 1
    if s2ActorCapture.pendingExitFrame then
        if s2ActorCapture.frame >= s2ActorCapture.pendingExitFrame then
            s2ActorCapture = nil
            print("[S2_ACTOR_CAPTURE] exiting after final frame completion")
            flycast.emulator.exit()
        end
        return
    end
    prepareS2ActorForNativeAcquisition()
    if not s2ActorCapture.controller then
        for _, target in ipairs(s2ActorCapture.targets) do
            if not target.completed then
                for _, address in ipairs(target.addresses) do
                    local controller = liveS2ActorController(address)
                    if controller then
                        s2ActorCapture.activeTarget = target
                        s2ActorCapture.controller = controller
                        s2ActorCapture.recordAddress = address
                        s2ActorCapture.nextCaptureFrame = s2ActorCapture.frame
                        print(string.format(
                            "[S2_ACTOR_CAPTURE] actor=%s record=0x%08x controller=0x%08x",
                            target.actorCode,
                            address,
                            controller
                        ))
                        break
                    end
                end
                if s2ActorCapture.controller then
                    break
                end
            end
        end
    end
    if (
        s2ActorCapture.controller
        and s2ActorCapture.frame >= s2ActorCapture.nextCaptureFrame
    ) then
        if (
            validS2Controller(s2ActorCapture.controller)
            and liveS2ActorController(s2ActorCapture.recordAddress)
                == s2ActorCapture.controller
        ) then
            s2ActorCapture.captured = s2ActorCapture.captured + 1
            flycast.capture.requestFrame()
            print(string.format(
                "[S2_ACTOR_CAPTURE] requested frame %d/%d for %s",
                s2ActorCapture.captured,
                s2ActorCapture.captureCount,
                s2ActorCapture.activeTarget.actorCode
            ))
            s2ActorCapture.nextCaptureFrame = (
                s2ActorCapture.frame + s2ActorCapture.captureSpacing
            )
            if s2ActorCapture.captured >= s2ActorCapture.captureCount then
                local completedCode = s2ActorCapture.activeTarget.actorCode
                s2ActorCapture.activeTarget.completed = true
                print("[S2_ACTOR_CAPTURE] complete: " .. completedCode)
                local allComplete = true
                for _, target in ipairs(s2ActorCapture.targets) do
                    if not target.completed then
                        allComplete = false
                        break
                    end
                end
                if allComplete then
                    if exitAfterS2ActorCapture then
                        -- PVR capture is asynchronous. Keep the emulator alive
                        -- for three VBlanks so the final requested frame is
                        -- actually serialized before an unattended run exits.
                        s2ActorCapture.pendingExitFrame =
                            s2ActorCapture.frame + 3
                        print(
                            "[S2_ACTOR_CAPTURE] waiting for final frame completion"
                        )
                    else
                        s2ActorCapture = nil
                    end
                    return
                end
                s2ActorCapture.controller = nil
                s2ActorCapture.recordAddress = nil
                s2ActorCapture.activeTarget = nil
                s2ActorCapture.captured = 0
            end
        else
            print("[S2_ACTOR_CAPTURE] actor controller retired before completion")
            s2ActorCapture.controller = nil
            s2ActorCapture.recordAddress = nil
            s2ActorCapture.activeTarget = nil
            s2ActorCapture.captured = 0
        end
    end
    if s2ActorCapture and s2ActorCapture.frame >= s2ActorCapture.timeoutFrames then
        print("[S2_ACTOR_CAPTURE] timeout before all targets completed")
        s2ActorCapture = nil
        if exitAfterS2ActorCapture then
            print("[S2_ACTOR_CAPTURE] exiting after timeout")
            flycast.emulator.exit()
        end
    end
end

local function startRaceRouteRecording()
    local timestamp = os.time()
    local outputPath = string.format(
        "%s/forklift-race-route-%d.csv",
        raceRouteOutputRoot,
        timestamp
    )
    local output, err = io.open(outputPath, "w")
    if not output then
        print("[RACE_ROUTE] cannot create recording: " .. tostring(err))
        return
    end
    output:write("# schema=shenmue-forklift-race-route-v1\n")
    output:write("# source=Disc 3 displayed slot 1 (Lua state index 0)\n")
    output:write("frame,forklift,xBits,yBits,zBits,yawBits\n")
    raceRouteRecording = {
        frame = 0,
        output = output,
        outputPath = outputPath
    }
    flycast.emulator.loadState(0)
    print("[RACE_ROUTE] loaded slot 0; recording native racers")
end

local function consumeBoundaryRequest()
    local request = io.open(boundaryRequestPath, "r")
    if not request then
        return nil
    end
    local frames = tonumber(request:read("*l") or "") or 7200
    request:close()
    os.remove(boundaryRequestPath)
    return math.max(60, frames)
end

local function startBoundaryRecording(frames)
    local timestamp = os.time()
    local outputPath = string.format(
        "%s/jd00-boundary-%d.csv",
        boundaryOutputRoot,
        timestamp
    )
    local output, err = io.open(outputPath, "w")
    if not output then
        print("[BOUNDARY] cannot create recording: " .. tostring(err))
        return
    end
    output:write("# schema=shenmue-jd00-boundary-runtime-v1\n")
    output:write("# no movement or memory writes are performed\n")
    output:write(
        "frame,xBits,zBits,eventId,eventFlags,selector,"
        .. "fieldManager,eventToken,eventBytes\n"
    )
    boundaryRecording = {
        frame = 0,
        frames = frames,
        lastEventId = -1,
        lastSelector = -1,
        output = output,
        outputPath = outputPath
    }
    print(string.format(
        "[BOUNDARY] recording %d frames; walk through one exit normally",
        frames
    ))
end

local function finishBoundaryRecording()
    boundaryRecording.output:close()
    print("[BOUNDARY] wrote " .. boundaryRecording.outputPath)
    boundaryRecording = nil
end

local function recordBoundary()
    boundaryRecording.frame = boundaryRecording.frame + 1
    local frameNumber = boundaryRecording.frame
    local position = flycast.memory.readTable32(jd00RyoTask + 0x28, 3)
    local watcher = flycast.memory.readTable32(jd00EventWatcher, 3)
    local selectorWords = flycast.memory.readTable32(jd00SelectorWord, 1)
    local managerWords = flycast.memory.readTable32(fieldManagerGlobal, 1)
    local manager = managerWords[fieldManagerGlobal]
    local eventToken = 0
    local eventBytes = 0
    if manager ~= 0 then
        local eventFields = flycast.memory.readTable32(manager + 0x10, 2)
        eventToken = eventFields[manager + 0x10]
        eventBytes = eventFields[manager + 0x14]
    end
    local eventId = watcher[jd00EventWatcher + 0x04] % 0x10000
    local eventFlags = watcher[jd00EventWatcher + 0x08]
    local selector = math.floor(
        selectorWords[jd00SelectorWord] / 0x10000
    ) % 0x100
    boundaryRecording.output:write(string.format(
        "%d,%08x,%08x,%d,%08x,%d,%08x,%08x,%d\n",
        frameNumber,
        position[jd00RyoTask + 0x28],
        position[jd00RyoTask + 0x30],
        eventId,
        eventFlags,
        selector,
        manager,
        eventToken,
        eventBytes
    ))
    if (
        eventId ~= boundaryRecording.lastEventId
        or selector ~= boundaryRecording.lastSelector
    ) then
        print(string.format(
            "[BOUNDARY] frame=%d event=%d selector=%d",
            frameNumber,
            eventId,
            selector
        ))
        flycast.capture.requestFrame()
        boundaryRecording.lastEventId = eventId
        boundaryRecording.lastSelector = selector
    end
    if frameNumber >= boundaryRecording.frames then
        finishBoundaryRecording()
    end
end

local function finishRaceRouteRecording()
    raceRouteRecording.output:close()
    print("[RACE_ROUTE] wrote " .. raceRouteRecording.outputPath)
    raceRouteRecording = nil
end

local function recordRaceRoute()
    raceRouteRecording.frame = raceRouteRecording.frame + 1
    local recordingFrame = raceRouteRecording.frame
    -- Wait a second after loading the state, then sample at 10 Hz. Six
    -- minutes covers the countdown and three complete native laps.
    if recordingFrame >= 61 and recordingFrame % 3 == 1 then
        for forkliftIndex, taskAddress in ipairs(raceForkliftTasks) do
            local fields = flycast.memory.readTable32(taskAddress + 0x28, 6)
            raceRouteRecording.output:write(string.format(
                "%d,%d,%08x,%08x,%08x,%08x\n",
                recordingFrame - 60,
                forkliftIndex - 1,
                fields[taskAddress + 0x28],
                fields[taskAddress + 0x2c],
                fields[taskAddress + 0x30],
                fields[taskAddress + 0x34]
            ))
        end
    end
    if recordingFrame >= 10860 then
        finishRaceRouteRecording()
    end
end

local function applyMemoryWrites(requestData)
    for _, write in ipairs(requestData.writes) do
        flycast.memory.write32(write.address, write.value)
    end
end

local function startInputPulse(request)
    inputPulse = {
        frame = 0,
        port = request.port,
        buttons = request.buttons,
        frames = request.frames,
        loadState = request.loadState,
        axisX = request.axisX,
        axisY = request.axisY,
        triggerLeft = request.triggerLeft,
        triggerRight = request.triggerRight
    }
    if inputPulse.loadState >= 0 then
        print(string.format(
            "[INPUT_PULSE] loading save-state slot %d",
            inputPulse.loadState
        ))
        flycast.emulator.loadState(inputPulse.loadState)
    end
end

local function recordInputPulse()
    inputPulse.frame = inputPulse.frame + 1
    -- Give a loaded state one second to resume before applying input.
    local firstPressFrame = inputPulse.loadState >= 0 and 61 or 1
    local releaseFrame = firstPressFrame + inputPulse.frames
    if inputPulse.frame >= firstPressFrame and inputPulse.frame < releaseFrame then
        flycast.input.pressButtons(inputPulse.port, inputPulse.buttons)
        flycast.input.setAxis(inputPulse.port, 1, inputPulse.axisX)
        flycast.input.setAxis(inputPulse.port, 2, inputPulse.axisY)
        flycast.input.setAxis(inputPulse.port, 5, inputPulse.triggerLeft)
        flycast.input.setAxis(inputPulse.port, 6, inputPulse.triggerRight)
    else
        flycast.input.releaseButtons(inputPulse.port, inputPulse.buttons)
        flycast.input.setAxis(inputPulse.port, 1, 0)
        flycast.input.setAxis(inputPulse.port, 2, 0)
        flycast.input.setAxis(inputPulse.port, 5, 0)
        flycast.input.setAxis(inputPulse.port, 6, 0)
    end
    if inputPulse.frame >= releaseFrame + 15 then
        print(string.format(
            "[INPUT_PULSE] complete: port=%d buttons=0x%x axes=%d,%d triggers=%d,%d frames=%d",
            inputPulse.port,
            inputPulse.buttons,
            inputPulse.axisX,
            inputPulse.axisY,
            inputPulse.triggerLeft,
            inputPulse.triggerRight,
            inputPulse.frames
        ))
        inputPulse = nil
    end
end

local function armExperiment()
    frame = 0
    armed = true
    flycast.input.releaseButtons(1, controlledDpadButtons)
    print("[RYO_PROBE] hallway experiment armed")
end

local function capture(phase)
    print(string.format("[RYO_PROBE] capture %s at experiment frame %d", phase, frame))
    flycast.capture.requestFrame()
end

local function setDpad(buttons)
    flycast.input.releaseButtons(1, controlledDpadButtons)
    if buttons ~= 0 then
        flycast.input.pressButtons(1, buttons)
    end
end

local function setForward(enabled)
    flycast.input.setAxis(1, 1, 0)
    flycast.input.setAxis(1, 2, 0)
    flycast.input.setAxis(1, 5, 0)
    flycast.input.setAxis(1, 6, 0)
    setDpad(enabled and dpadUp or 0)
end

local function matrixPhase(recordingFrame, mode)
    if mode == "long-walk" then
        if recordingFrame <= 60 then
            return "idle-long", 0
        elseif recordingFrame <= 420 then
            return "walk-long", dpadUp
        elseif recordingFrame <= 480 then
            return "stop-long", 0
        end
        return nil, 0
    end

    if recordingFrame <= 60 then
        return "idle-a", 0
    elseif recordingFrame <= 120 then
        return "walk-a", dpadUp
    elseif recordingFrame <= 180 then
        return "stop-a", 0
    end
    return nil, 0
end

local function startMatrixRecording(mode)
    local timestamp = os.time()
    local outputPath = string.format("%s/ryo-matrices-%d.csv", matrixOutputRoot, timestamp)
    local controlPath = string.format("%s/ryo-controls-%d.csv", matrixOutputRoot, timestamp)
    local output, err = io.open(outputPath, "w")
    if not output then
        print("[RYO_MATRIX] cannot create recording: " .. tostring(err))
        return
    end
    local controlOutput, controlErr = io.open(controlPath, "w")
    if not controlOutput then
        output:close()
        print("[RYO_MATRIX] cannot create control recording: " .. tostring(controlErr))
        return
    end

    output:write("# schema=shenmue-ryo-runtime-matrices-v1\n")
    output:write(string.format(
        "# base=0x%08x,count=%d,stride=%d,wordsPerMatrix=%d\n",
        matrixBase,
        matrixCount,
        matrixStride,
        matrixWords
    ))
    local header = {"frame", "phase", "dpadButtons"}
    for matrixIndex = 0, matrixCount - 1 do
        for wordIndex = 0, matrixWords - 1 do
            header[#header + 1] = string.format("m%02d_%02d", matrixIndex, wordIndex)
        end
    end
    output:write(table.concat(header, ","), "\n")

    controlOutput:write("# schema=shenmue-ryo-runtime-controls-v1\n")
    controlOutput:write(string.format(
        "# base=0x%08x,count=%d,stride=%d,wordsPerControl=%d\n",
        controlBase,
        controlCount,
        controlStride,
        controlWords
    ))
    local controlHeader = {"frame", "phase", "dpadButtons"}
    for controlIndex = 0, controlCount - 1 do
        for wordIndex = 0, controlWords - 1 do
            controlHeader[#controlHeader + 1] = string.format(
                "c%02d_%02d",
                controlIndex,
                wordIndex
            )
        end
    end
    controlOutput:write(table.concat(controlHeader, ","), "\n")

    matrixRecording = {
        frame = 0,
        mode = mode or "short-step",
        output = output,
        path = outputPath,
        controlOutput = controlOutput,
        controlPath = controlPath
    }
    setForward(false)
    print(string.format(
        "[RYO_MATRIX] %s recording started: %s",
        matrixRecording.mode,
        outputPath
    ))
end

local function recordMatrices()
    matrixRecording.frame = matrixRecording.frame + 1
    local phase, dpadButtons = matrixPhase(
        matrixRecording.frame,
        matrixRecording.mode
    )
    if not phase then
        setForward(false)
        matrixRecording.output:close()
        matrixRecording.controlOutput:close()
        print("[RYO_MATRIX] recording complete: " .. matrixRecording.path)
        print("[RYO_MATRIX] control recording complete: " .. matrixRecording.controlPath)
        matrixRecording = nil
        return
    end

    setForward(dpadButtons == dpadUp)
    local words = flycast.memory.readTable32(matrixBase, matrixCount * matrixWords)
    local row = {
        tostring(matrixRecording.frame),
        phase,
        tostring(dpadButtons)
    }
    for matrixIndex = 0, matrixCount - 1 do
        local matrixAddress = matrixBase + matrixIndex * matrixStride
        for wordIndex = 0, matrixWords - 1 do
            local address = matrixAddress + wordIndex * 4
            row[#row + 1] = string.format("%08x", words[address])
        end
    end
    matrixRecording.output:write(table.concat(row, ","), "\n")

    local controlWordsByAddress = flycast.memory.readTable32(
        controlBase,
        controlCount * controlWords
    )
    local controlRow = {
        tostring(matrixRecording.frame),
        phase,
        tostring(dpadButtons)
    }
    for controlIndex = 0, controlCount - 1 do
        local controlAddress = controlBase + controlIndex * controlStride
        for wordIndex = 0, controlWords - 1 do
            local address = controlAddress + wordIndex * 4
            controlRow[#controlRow + 1] = string.format(
                "%08x",
                controlWordsByAddress[address]
            )
        end
    end
    matrixRecording.controlOutput:write(table.concat(controlRow, ","), "\n")
end

local function finishDrawerRecording()
    flycast.input.releaseButtons(1, buttonA + buttonB)
    drawerRecording.output:close()
    print("[DRAWER] recording complete: " .. drawerRecording.path)
    drawerRecording = nil
end

local function startDrawerRecording(
    mode,
    requestedMemoryBase,
    requestedMemoryBytes,
    loadState,
    inputButtons,
    inputStartFrame,
    inputFrames
)
    local timestamp = os.time()
    local outputRoot = matrixOutputRoot .. "/../objects"
    os.execute(string.format("mkdir -p %q", outputRoot))
    local recordingMode = mode or "open-close"
    local memoryBase = requestedMemoryBase or drawerMemoryBase
    local memoryBytes = requestedMemoryBytes or drawerMemoryBytes
    local memoryWords = math.floor(memoryBytes / 4)
    local outputPrefix = recordingMode == "one-shot" and "object-once" or "drawer-open"
    local outputPath = string.format("%s/%s-%d.csv", outputRoot, outputPrefix, timestamp)
    local output, err = io.open(outputPath, "w")
    if not output then
        print("[DRAWER] cannot create recording: " .. tostring(err))
        return
    end

    output:write("# schema=shenmue-object-memory-words-v1\n")
    output:write(string.format(
        "# base=0x%08x,bytes=%d,saveState=%s,aButton=0x%x\n",
        memoryBase,
        memoryBytes,
        loadState == false and "none" or "0",
        buttonA
    ))
    local header = {"frame", "phase", "aPressed", "bPressed"}
    for wordIndex = 0, memoryWords - 1 do
        header[#header + 1] = string.format(
            "w_%08x",
            memoryBase + wordIndex * 4
        )
    end
    output:write(table.concat(header, ","), "\n")

    drawerRecording = {
        frame = 0,
        mode = recordingMode,
        memoryBase = memoryBase,
        memoryWords = memoryWords,
        inputButtons = inputButtons or buttonA,
        inputStartFrame = inputStartFrame or 61,
        inputFrames = inputFrames or 15,
        output = output,
        path = outputPath
    }
    flycast.input.releaseButtons(1, controlledDpadButtons + buttonA + buttonB)
    if loadState == false then
        print("[DRAWER] recording current emulator state without reload")
    else
        print("[DRAWER] loading save-state slot 1 (Flycast index 0)")
        flycast.emulator.loadState(0)
    end
end

local function recordDrawer()
    drawerRecording.frame = drawerRecording.frame + 1
    local recordingFrame = drawerRecording.frame
    -- Interpreter-mode tracing can present fewer completed game frames per
    -- host VBlank. Hold A longer for one-shot interactions so the game's
    -- 30 Hz input poll cannot miss the pulse.
    local inputEndFrame = drawerRecording.inputStartFrame
        + drawerRecording.inputFrames
    local customInputPressed = drawerRecording.mode == "one-shot"
        and recordingFrame >= drawerRecording.inputStartFrame
        and recordingFrame < inputEndFrame
    local aReleaseFrame = drawerRecording.mode == "one-shot" and 75 or 63
    local aPressed = drawerRecording.mode == "one-shot"
        and drawerRecording.inputButtons == buttonA
        and customInputPressed
        or drawerRecording.mode ~= "one-shot"
            and recordingFrame >= 61 and recordingFrame <= aReleaseFrame
    local bPressed = drawerRecording.mode ~= "one-shot"
        and recordingFrame >= 241 and recordingFrame <= 243
    local phase = "closed"
    if recordingFrame >= 61 and recordingFrame <= 63 then
        phase = "press-a"
    elseif recordingFrame > 63 then
        phase = "opening"
    end
    if drawerRecording.mode == "one-shot" and recordingFrame > 63 then
        phase = "active"
    elseif recordingFrame >= 220 and recordingFrame <= 240 then
        phase = "open"
    elseif recordingFrame >= 241 and recordingFrame <= 243 then
        phase = "press-b"
    elseif recordingFrame > 243 then
        phase = "closing"
    end

    if aPressed then
        flycast.input.pressButtons(1, buttonA)
    else
        flycast.input.releaseButtons(1, buttonA)
    end
    if bPressed then
        flycast.input.pressButtons(1, buttonB)
    else
        flycast.input.releaseButtons(1, buttonB)
    end
    if drawerRecording.mode == "one-shot"
        and drawerRecording.inputButtons ~= buttonA then
        if customInputPressed then
            flycast.input.pressButtons(1, drawerRecording.inputButtons)
        else
            flycast.input.releaseButtons(1, drawerRecording.inputButtons)
        end
    end

    local words = flycast.memory.readTable32(
        drawerRecording.memoryBase,
        drawerRecording.memoryWords
    )
    local row = {
        tostring(recordingFrame),
        phase,
        aPressed and "1" or "0",
        bPressed and "1" or "0"
    }
    for wordIndex = 0, drawerRecording.memoryWords - 1 do
        local address = drawerRecording.memoryBase + wordIndex * 4
        row[#row + 1] = string.format("%08x", words[address])
    end
    drawerRecording.output:write(table.concat(row, ","), "\n")

    if (
        recordingFrame == 50
        or recordingFrame == 68
        or recordingFrame == 76
        or recordingFrame == 90
        or recordingFrame == 120
        or recordingFrame == 180
        or recordingFrame == 230
        or recordingFrame == 248
        or recordingFrame == 260
        or recordingFrame == 280
        or recordingFrame == 320
        or recordingFrame == 380
    ) then
        print(string.format("[DRAWER] full RAM capture at frame %d", recordingFrame))
        flycast.capture.requestFrame()
    end

    if recordingFrame >= 420 then
        finishDrawerRecording()
    end
end

local function onVBlank()
    if repeatedMemoryWrites then
        applyMemoryWrites(repeatedMemoryWrites)
        repeatedMemoryWrites.frames = repeatedMemoryWrites.frames - 1
        if repeatedMemoryWrites.frames <= 0 then
            print(string.format(
                "[MEMORY_WRITE] completed %d repeated writes",
                #repeatedMemoryWrites.writes
            ))
            repeatedMemoryWrites = nil
        end
    end

    if inputPulse then
        recordInputPulse()
        return
    end

    if frameCapture then
        recordFrameCapture()
        return
    end

    if s2ActorCapture then
        pollFrame = pollFrame + 1
        if pollFrame % 30 == 0 then
            local memoryWrites = consumeMemoryWriteRequest(memoryWriteRequestPath)
            if memoryWrites then
                repeatedMemoryWrites = memoryWrites
                print(string.format(
                    "[MEMORY_WRITE] applying %d writes for %d frames",
                    #memoryWrites.writes,
                    memoryWrites.frames
                ))
            else
                local requestedPulse = consumeInputPulseRequest(
                    inputPulseRequestPath
                )
                if requestedPulse then
                    startInputPulse(requestedPulse)
                else
                    local requestedFrameCapture = consumeFrameCaptureRequest(
                        frameCaptureRequestPath
                    )
                    if requestedFrameCapture then
                        startFrameCapture(requestedFrameCapture)
                    else
                        local replacement = consumeS2ActorCaptureRequest(
                            s2ActorCaptureRequestPath
                        )
                        if replacement then
                            print("[S2_ACTOR_CAPTURE] replacing active watcher")
                            startS2ActorCapture(replacement)
                        end
                    end
                end
            end
        end
        recordS2ActorCapture()
        return
    end

    if raceRouteRecording then
        recordRaceRoute()
        return
    end

    if boundaryRecording then
        recordBoundary()
        return
    end

    if drawerRecording then
        recordDrawer()
        return
    end

    if matrixRecording then
        recordMatrices()
        return
    end

    if not armed then
        pollFrame = pollFrame + 1
        if pollFrame % 30 == 0 then
            local memoryWrites = consumeMemoryWriteRequest(memoryWriteRequestPath)
            if memoryWrites then
                repeatedMemoryWrites = memoryWrites
                print(string.format(
                    "[MEMORY_WRITE] applying %d writes for %d frames",
                    #memoryWrites.writes,
                    memoryWrites.frames
                ))
            else
                -- Consume only the request that can actually be started.
                -- Previously every request file was removed up front, so an
                -- object recording submitted alongside a memory-placement
                -- request could be silently discarded.
                local pulseRequest = consumeInputPulseRequest(
                    inputPulseRequestPath
                )
                if pulseRequest then
                    startInputPulse(pulseRequest)
                else
                    local frameCaptureRequest = consumeFrameCaptureRequest(
                        frameCaptureRequestPath
                    )
                    if frameCaptureRequest then
                        startFrameCapture(frameCaptureRequest)
                    else
                        local actorCaptureRequest = consumeS2ActorCaptureRequest(
                            s2ActorCaptureRequestPath
                        )
                        if actorCaptureRequest then
                            startS2ActorCapture(actorCaptureRequest)
                        else
                            local boundaryFrames = consumeBoundaryRequest()
                            if boundaryFrames then
                                startBoundaryRecording(boundaryFrames)
                            elseif consumeRequest(raceRouteRequestPath) then
                                startRaceRouteRecording()
                            else
                                local objectRequest = consumeObjectRequest(
                                    objectOnceRequestPath
                                )
                                if objectRequest then
                                    startDrawerRecording(
                                        "one-shot",
                                        objectRequest.memoryBase,
                                        objectRequest.memoryBytes,
                                        objectRequest.loadState,
                                        objectRequest.inputButtons,
                                        objectRequest.inputStartFrame,
                                        objectRequest.inputFrames
                                    )
                                elseif consumeRequest(drawerRequestPath) then
                                    startDrawerRecording("open-close")
                                elseif consumeRequest(longWalkRequestPath) then
                                    startMatrixRecording("long-walk")
                                elseif consumeRequest(matrixRequestPath) then
                                    startMatrixRecording("short-step")
                                elseif consumeRequest(requestPath) then
                                    armExperiment()
                                end
                            end
                        end
                    end
                end
            end
        end
        return
    end

    frame = frame + 1
    if frame == 60 then
        capture("idle")
    elseif frame == 90 then
        print("[RYO_PROBE] pressing forward")
        setForward(true)
    elseif frame == 98 then
        capture("walk-start")
    elseif frame == 120 then
        capture("walk-mid")
    elseif frame == 150 then
        capture("walk-late")
    elseif frame == 180 then
        print("[RYO_PROBE] releasing forward")
        setForward(false)
    elseif frame == 210 then
        capture("stopped")
        armed = false
        print("[RYO_PROBE] hallway experiment complete")
    end
end

flycast_callbacks = {
    vblank = onVBlank
}

print("[RYO_PROBE] synchronized RAM/geometry and matrix probes loaded; waiting for request")

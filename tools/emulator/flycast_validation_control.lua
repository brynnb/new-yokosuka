local requestPath = os.getenv("FLYCAST_VALIDATION_INPUT_REQUEST")
    or ".flycast-pvr/validation/control/input.request"
local activePulse = nil
local pollFrame = 0

local function consumeRequest()
    local request = io.open(requestPath, "r")
    if not request then
        return nil
    end
    local line = request:read("*l") or ""
    request:close()
    os.remove(requestPath)
    if line == "exit" then
        return { exit = true }
    end

    local port, buttons, frames, loadState, axisX, axisY, triggerLeft,
        triggerRight = line:match(
        "^(%S+)%s+(%S+)%s+(%S+)%s+(%S+)%s+(%S+)%s+(%S+)%s+(%S+)%s+(%S+)$"
    )
    if not port then
        print("[VALIDATION_INPUT] rejected malformed request: " .. line)
        return nil
    end
    return {
        port = tonumber(port),
        buttons = tonumber(buttons),
        frames = tonumber(frames),
        loadState = tonumber(loadState),
        axisX = tonumber(axisX),
        axisY = tonumber(axisY),
        triggerLeft = tonumber(triggerLeft),
        triggerRight = tonumber(triggerRight)
    }
end

local function validRequest(request)
    return request.port ~= nil
        and request.port >= 1
        and request.buttons ~= nil
        and request.buttons >= 0
        and request.frames ~= nil
        and request.frames >= 1
        and request.loadState ~= nil
        and request.loadState >= -1
        and request.axisX ~= nil
        and request.axisX >= -128
        and request.axisX <= 127
        and request.axisY ~= nil
        and request.axisY >= -128
        and request.axisY <= 127
        and request.triggerLeft ~= nil
        and request.triggerLeft >= 0
        and request.triggerLeft <= 255
        and request.triggerRight ~= nil
        and request.triggerRight >= 0
        and request.triggerRight <= 255
end

local function releaseInput(pulse)
    flycast.input.releaseButtons(pulse.port, pulse.buttons)
    flycast.input.setAxis(pulse.port, 1, 0)
    flycast.input.setAxis(pulse.port, 2, 0)
    flycast.input.setAxis(pulse.port, 5, 0)
    flycast.input.setAxis(pulse.port, 6, 0)
end

local function startPulse(request)
    if request.exit then
        print("[VALIDATION_INPUT] exiting emulator")
        flycast.emulator.exit()
        return
    end
    if not validRequest(request) then
        print("[VALIDATION_INPUT] rejected out-of-range request")
        return
    end
    request.frame = 0
    activePulse = request
    if request.loadState >= 0 then
        print(string.format(
            "[VALIDATION_INPUT] loading state index %d",
            request.loadState
        ))
        flycast.emulator.loadState(request.loadState)
    end
end

local function updatePulse()
    activePulse.frame = activePulse.frame + 1
    local firstPressFrame = activePulse.loadState >= 0 and 61 or 1
    local releaseFrame = firstPressFrame + activePulse.frames
    if activePulse.frame >= firstPressFrame
        and activePulse.frame < releaseFrame then
        flycast.input.pressButtons(activePulse.port, activePulse.buttons)
        flycast.input.setAxis(activePulse.port, 1, activePulse.axisX)
        flycast.input.setAxis(activePulse.port, 2, activePulse.axisY)
        flycast.input.setAxis(
            activePulse.port,
            5,
            activePulse.triggerLeft
        )
        flycast.input.setAxis(
            activePulse.port,
            6,
            activePulse.triggerRight
        )
    else
        releaseInput(activePulse)
    end
    if activePulse.frame >= releaseFrame + 15 then
        print(string.format(
            "[VALIDATION_INPUT] completed port=%d buttons=0x%x frames=%d",
            activePulse.port,
            activePulse.buttons,
            activePulse.frames
        ))
        activePulse = nil
    end
end

local function onVBlank()
    if activePulse then
        updatePulse()
        return
    end
    pollFrame = pollFrame + 1
    if pollFrame % 15 == 0 then
        local request = consumeRequest()
        if request then
            startPulse(request)
        end
    end
end

flycast_callbacks = {
    vblank = onVBlank
}

print("[VALIDATION_INPUT] controller ready: " .. requestPath)

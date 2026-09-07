-- Frame-exact Shenmue I FACE-state capture for an existing Flycast profile.
-- The request supplies every observed FACE-state address; this script does not
-- guess actor layouts or mutate Dreamcast RAM.

local requestPath = os.getenv("FLYCAST_S1_FACE_TRACE_REQUEST")
    or ".flycast-pvr/face-trace/control/face-runtime.request"
local outputPath = os.getenv("FLYCAST_S1_FACE_TRACE_OUTPUT")
    or ".flycast-pvr/face-trace/output/face-runtime.csv"

local trace = nil
local pollFrame = 0

local function consumeRequest()
    local request = io.open(requestPath, "r")
    if not request then
        return nil
    end
    local result = { faces = {} }
    for line in request:lines() do
        local key, value = line:match("^(%S+)%s+(.+)$")
        if key == "face" then
            local label, address = value:match("^(%S+)%s+(%S+)$")
            if label and address and tonumber(address) then
                table.insert(result.faces, {
                    label = label,
                    address = tonumber(address)
                })
            end
        elseif key and value then
            result[key] = tonumber(value)
        end
    end
    request:close()
    os.remove(requestPath)
    return result
end

local function validRequest(request)
    return request.frames ~= nil
        and request.frames >= 1
        and request.load_state ~= nil
        and request.load_state >= -1
        and request.input_frame ~= nil
        and request.input_frame >= 1
        and request.input_buttons ~= nil
        and request.input_buttons >= 0
        and request.input_frames ~= nil
        and request.input_frames >= 1
        and #request.faces >= 1
end

local function releaseInput(request)
    flycast.input.releaseButtons(1, request.input_buttons)
end

local function startTrace(request)
    if not validRequest(request) then
        print("[S1_FACE_TRACE] rejected invalid request")
        return
    end
    local output = io.open(outputPath, "w")
    if not output then
        print("[S1_FACE_TRACE] could not open output: " .. outputPath)
        return
    end
    output:write("frame,label,address")
    for word = 0, 51 do
        output:write(string.format(",word_%02x", word * 4))
    end
    output:write("\n")
    request.output = output
    request.frame = 0
    trace = request
    releaseInput(trace)
    if trace.load_state >= 0 then
        print(string.format(
            "[S1_FACE_TRACE] loading state index %d",
            trace.load_state
        ))
        flycast.emulator.loadState(trace.load_state)
    end
    print(string.format(
        "[S1_FACE_TRACE] armed frames=%d inputFrame=%d faces=%d",
        trace.frames,
        trace.input_frame,
        #trace.faces
    ))
end

local function recordFace(face)
    local words = flycast.memory.readTable32(face.address, 52)
    trace.output:write(string.format(
        "%d,%s,0x%08x",
        trace.frame,
        face.label,
        face.address
    ))
    for index = 0, 51 do
        local wordAddress = face.address + index * 4
        trace.output:write(string.format(",%08x", words[wordAddress]))
    end
    trace.output:write("\n")
end

local function updateTrace()
    trace.frame = trace.frame + 1
    local inputEnd = trace.input_frame + trace.input_frames
    if trace.frame >= trace.input_frame and trace.frame < inputEnd then
        flycast.input.pressButtons(1, trace.input_buttons)
    else
        releaseInput(trace)
    end
    for _, face in ipairs(trace.faces) do
        recordFace(face)
    end
    trace.output:flush()
    if trace.frame >= trace.frames then
        releaseInput(trace)
        trace.output:close()
        print(string.format(
            "[S1_FACE_TRACE] complete frames=%d output=%s",
            trace.frame,
            outputPath
        ))
        trace = nil
    end
end

local function onVBlank()
    if trace then
        updateTrace()
        return
    end
    pollFrame = pollFrame + 1
    if pollFrame % 15 == 0 then
        local request = consumeRequest()
        if request then
            startTrace(request)
        end
    end
end

flycast_callbacks = {
    vblank = onVBlank
}

print("[S1_FACE_TRACE] controller ready: " .. requestPath)

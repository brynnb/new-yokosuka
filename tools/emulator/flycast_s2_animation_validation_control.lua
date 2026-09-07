local requestPath = os.getenv("FLYCAST_S2_ANIMATION_VALIDATION_REQUEST")
    or ".flycast-pvr/animation-validation/control.request"
local pollFrame = 0

local function onVBlank()
    pollFrame = pollFrame + 1
    if pollFrame % 15 ~= 0 then
        return
    end
    local request = io.open(requestPath, "r")
    if not request then
        return
    end
    local command = request:read("*l") or ""
    request:close()
    os.remove(requestPath)
    if command == "exit" then
        print("[S2_ANIMATION_VALIDATION] exiting emulator")
        flycast.emulator.exit()
    else
        print("[S2_ANIMATION_VALIDATION] rejected command: " .. command)
    end
end

flycast_callbacks = {
    vblank = onVBlank
}

print("[S2_ANIMATION_VALIDATION] control ready: " .. requestPath)

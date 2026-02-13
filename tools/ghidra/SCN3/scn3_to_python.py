import json
import sys
import os
import struct
import re

# ================================================================
# MODEL ALIASES (User-provided Rosetta Stone mappings)
# ================================================================
MODEL_ALIASES = {
    "TUB0210G.MT5": "SWORD_HILT",
    "TUBS205G.MT5": "VASE1",
    "TUBT2051.MT5": "VASE2",
}

# ================================================================
# FUNCTION SET MAPPINGS
# Derived from leaked SEQCONV.C, Wulinshu wiki (shenmuescripts.md),
# and Memory Addresses (SM1).md
# ================================================================

# ================================================================
# Function Set 7 (PC: 140554210): 8 dispatch functions.
# Each dispatch function takes a 16-bit OPERATION CODE as sub-op.
# Encoding: high byte = category (selects dispatch fn), low byte = sub-op.
#
# Architecture (from shenmuescripts.md + GhidraSCN3 slaspec):
#   Opcodes 0x1D/0x2D/0x3D -> CallTblFn0 -> 8 dispatch functions
#   The operand is NOT a flat index but a categorized sub-operation.
#
# Cross-referenced with:
#   - Shenmue II event_sdk (LemonHaze420) engine function names
#   - PC port v1.07 function tables (shenmuescripts.md)
#   - JOMO bytecode frequency analysis (10,495 calls)
#   - Decompiled cutscene viewer + vending machine code
# ================================================================
SET7_VERBS = {
    # ---- Category 0x03: System/debug (76 calls) ----
    "0x0385": "sys_debug_print",     # 76 calls — debug output

    # ---- Category 0x1D: Task/flow control (86 calls) ----
    # Maps to HLib task queue operations (taskqueuesystem.md)
    "0x1df2": "task_yield",          # 86 calls — yield execution (cooperative multitask)

    # ---- Category 0x2D: Entity management (5870 calls) ----
    # THE workhorse category. Configures entity properties via MOBJ cycle pointer.
    # Maps to EV_CreateCharacter, SetCEWPFlags, SetMTWKFlags etc. in event_sdk
    "0x2d46": "entity_set_anim",     # 340 calls — assign animation (PlayAnimationForCharacterByID)
    "0x2d56": "entity_setup",        # 4942 calls — configure entity properties
    "0x2d66": "entity_set_attrs",    # 419 calls — set entity attributes/flags
    "0x2d76": "entity_set_state",    # 109 calls — change entity runtime state
    "0x2d86": "entity_set_flags",    # Set entity bitflags
    "0x2d96": "entity_get_state",    # Query entity runtime state

    # ---- Category 0x4D: Callback/event (51 calls) ----
    "0x4d22": "trigger_callback",    # 51 calls — fire a registered callback

    # ---- Category 0x56: Animation extended (24 calls) ----
    "0x56ea": "anim_play_ext",       # Extended animation play
    "0x54eb": "anim_set_frame",      # Set animation frame

    # ---- Category 0x8A: Resource loading (67 calls) ----
    # Maps to LoadFileFromDirectory, LoadAirTextures etc. in event_sdk
    "0x8ae5": "load_resource",       # 67 calls — load asset/resource
    "0x8ad5": "load_model",          # Load MT5 model resource

    # ---- Category 0xC0: System queries ----
    "0xc010": "get_system_flags",    # Read system flags

    # ---- Category 0xD1: Movement/pathfinding ----
    # Maps to navigation/pathfinding engine functions
    "0xd109": "move_set_waypoint",   # Navigation waypoint
    "0xd10b": "move_set_path_node",  # Path follower node
    "0xd10d": "move_set_target",     # Path target
    "0xd110": "move_stop",           # Stop movement
    "0xd11f": "move_set_speed",      # Set movement speed
    "0xd120": "move_set_accel",      # Set acceleration
    "0xd130": "move_along_path",     # Follow spline path
    "0xd148": "move_to_entity",      # Move toward another entity
    "0xd158": "move_set_mode",       # Set movement mode (walk/run)

    # ---- Category 0xD4: Position (200 calls) ----
    # Maps to FUN_0c0913c0 (set position) in event_sdk
    "0xd408": "pos_get_x",           # Read X coordinate
    "0xd409": "pos_get_y",           # Read Y coordinate
    "0xd40a": "pos_get_z",           # Read Z coordinate
    "0xd40b": "pos_get_xyz",         # Read all coordinates
    "0xd40c": "pos_set_x",           # Write X coordinate
    "0xd40e": "pos_set_y",           # Write Y coordinate
    "0xd40f": "pos_set_z",           # Write Z coordinate
    "0xd410": "pos_set_xyz",         # Write all coordinates
    "0xd411": "pos_get_world",       # Get world-space position
    "0xd413": "pos_set_world",       # Set world-space position
    "0xd414": "pos_get_local",       # Get local-space position
    "0xd415": "pos_set_local",       # Set local-space position
    "0xd416": "pos_offset",          # Offset from current position
    "0xd419": "pos_snap_ground",     # Snap to ground/surface
    "0xd41a": "pos_lerp_to",         # Interpolate to target position
    "0xd41c": "pos_get_dist",        # Get distance to target
    "0xd41e": "pos_copy_from",       # Copy position from another entity
    "0xd421": "pos_set_home",        # Set home/origin position
    "0xd423": "pos_get_home",        # Get home/origin position
    "0xd426": "pos_set_offset",      # Set position offset
    "0xd427": "pos_get_offset",      # Get position offset
    "0xd428": "pos_set_parent",      # Set parent-relative position
    "0xd429": "pos_get_parent",      # Get parent-relative position
    "0xd42b": "pos_attach",          # Attach to another entity's position
    "0xd42e": "pos_detach",          # Detach from parent position
    "0xd42f": "pos_set_bounds",      # Set position bounds/limits
    "0xd432": "pos_set_height",      # Set height/Y position
    "0xd434": "pos_get_height",      # Get height/Y position
    "0xd436": "pos_set_floor",       # Set floor level
    "0xd437": "pos_get_floor",       # Get floor level
    "0xd43b": "pos_set_collision",   # Set collision position
    "0xd43d": "pos_raycast",         # Raycast from position
    "0xd43e": "pos_raycast_down",    # Raycast downward
    "0xd43f": "pos_check_ground",    # Check ground below
    "0xd440": "pos_set_navmesh",     # Set navmesh position
    "0xd441": "pos_get_navmesh",     # Get navmesh position
    "0xd442": "pos_clamp_bounds",    # Clamp to bounds
    "0xd443": "pos_check_bounds",    # Check if in bounds
    "0xd444": "pos_set_region",      # Set region/zone
    "0xd445": "pos_get_region",      # Get region/zone
    "0xd448": "pos_set_ex",          # Extended position set
    "0xd449": "pos_get_ex",          # Extended position get
    "0xd44a": "pos_set_absolute",    # Set absolute world position
    "0xd44b": "pos_get_absolute",    # Get absolute world position
    "0xd44c": "pos_set_relative",    # Set relative position
    "0xd44e": "pos_transform",       # Apply transform matrix
    "0xd453": "pos_project",         # Project position
    "0xd454": "pos_unproject",       # Unproject position
    "0xd457": "pos_set_pivot",       # Set pivot point
    "0xd45c": "pos_interpolate",     # Interpolate between positions
    "0xd460": "pos_add_offset",      # Add offset to current position
    "0xd464": "pos_set_velocity",    # Set velocity vector
    "0xd465": "pos_get_velocity",    # Get velocity vector
    "0xd466": "pos_snap_surface",    # Snap to surface
    "0xd468": "pos_set_gravity",     # Set gravity influence
    "0xd473": "pos_set_anchor",      # Set anchor point
    "0xd484": "pos_set_waypoint",    # Set waypoint position
    "0xd496": "pos_path_follow",     # Follow path position
    "0xd49b": "pos_spline_eval",     # Evaluate spline position
    "0xd4a2": "pos_set_target",      # Set target position
    "0xd4a6": "pos_get_target",      # Get target position
    "0xd4ad": "pos_move_toward",     # Move toward target
    "0xd4b4": "pos_arrive_at",       # Arrive at target
    "0xd4ba": "pos_orbit",           # Orbit around point
    "0xd4c3": "pos_set_constraint",  # Set position constraint
    "0xd4c6": "pos_ease_to",         # Ease to target position
    "0xd4cb": "pos_spring_to",       # Spring toward target
    "0xd4d0": "pos_set_damping",     # Set position damping
    "0xd4d1": "pos_set_stiffness",   # Set spring stiffness
    "0xd4d9": "pos_set_mass",        # Set physics mass
    "0xd4db": "pos_apply_force",     # Apply force vector
    "0xd4e0": "pos_set_friction",    # Set friction
    "0xd4e5": "pos_set_restitution", # Set bounce/restitution

    # ---- Category 0xD5: Rotation/facing (1498 calls) ----
    # Largest sub-op space (~230 unique sub-ops observed)
    "0xd504": "rot_get_x",           # 7 — Get X rotation
    "0xd505": "rot_get_y",           # 150 — Get Y rotation (heading)
    "0xd506": "rot_get_z",           # 31 — Get Z rotation
    "0xd507": "rot_get_heading",     # 718 — Get heading angle (most common!)
    "0xd508": "rot_set_x",           # 43 — Set X rotation
    "0xd509": "rot_set_y",           # 56 — Set Y rotation
    "0xd50a": "rot_set_facing",      # 83 — Set facing direction
    "0xd50b": "rot_set_heading_abs", # Set absolute heading
    "0xd50c": "rot_set_heading",     # 29 — Set heading
    "0xd50d": "rot_set_look_at",     # 36 — Look at target
    "0xd50e": "rot_get_look_at",     # Get look-at direction
    "0xd50f": "rot_set_orient",      # 10 — Set full orientation
    "0xd510": "rot_smooth",          # 32 — Smooth rotation
    "0xd511": "rot_snap",            # Snap rotation
    "0xd514": "rot_lerp",            # 24 — Interpolate rotation
    "0xd515": "rot_slerp",           # 27 — Spherical interpolation
    "0xd516": "rot_set_speed",       # 28 — Set rotation speed
    "0xd518": "rot_set_accel",       # Rotation acceleration
    "0xd51a": "rot_face_entity",     # Face another entity
    "0xd51c": "rot_get_angle_to",    # 10 — Get angle to target
    "0xd51e": "rot_set_constraint",  # 21 — Set rotation constraint
    "0xd51f": "rot_clear_constraint",# Clear constraint
    "0xd520": "rot_set_limits",      # 8 — Set angle limits
    "0xd521": "rot_get_limits",      # Get angle limits
    "0xd522": "rot_set_pivot",       # 6 — Set rotation pivot
    "0xd523": "rot_get_pivot",       # Get rotation pivot
    "0xd524": "rot_set_axis",        # 7 — Set rotation axis
    "0xd525": "rot_get_axis",        # 9 — Get rotation axis
    "0xd527": "rot_set_weight",      # 6 — Set rotation blend weight
    "0xd529": "rot_set_ik_target",   # 4 — Set IK target
    "0xd52a": "rot_get_ik_target",   # 9 — Get IK target
    "0xd52b": "rot_set_ik_pole",     # 5 — Set IK pole vector
    "0xd52c": "rot_set_ik_chain",    # 8 — Set IK chain
    "0xd52e": "rot_set_blend",       # 5 — Set rotation blend
    "0xd52f": "rot_face_target",     # 8 — Rotate to face target
    "0xd531": "rot_set_spring",      # 3 — Spring rotation
    "0xd532": "rot_set_damping",     # 5 — Rotation damping
    "0xd533": "rot_set_stiffness",   # 4 — Rotation stiffness
    "0xd534": "rot_set_inertia",     # 6 — Rotation inertia
    "0xd535": "rot_get_angular_vel", # Get angular velocity
    "0xd536": "rot_set_angular_vel", # 4 — Set angular velocity
    "0xd538": "rot_set_torque",      # 9 — Apply torque
    "0xd539": "rot_set_friction",    # 6 — Rotation friction
    "0xd53a": "rot_get_euler",       # 3 — Get Euler angles
    "0xd53b": "rot_set_euler",       # 7 — Set Euler angles
    "0xd53c": "rot_set_quat",        # 4 — Set quaternion
    "0xd53d": "rot_get_quat",        # 6 — Get quaternion
    "0xd53e": "rot_set_matrix",      # 7 — Set rotation matrix
    "0xd53f": "rot_get_matrix",      # Get rotation matrix
    "0xd540": "rot_set_parent",      # 3 — Set parent rotation
    "0xd541": "rot_get_parent",      # Get parent rotation
    "0xd542": "rot_inherit",         # 6 — Inherit parent rotation
    "0xd543": "rot_set_local",       # 5 — Set local rotation
    "0xd544": "rot_get_local",       # 4 — Get local rotation
    "0xd545": "rot_set_world",       # 3 — Set world rotation
    "0xd547": "rot_get_world",       # 4 — Get world rotation
    "0xd548": "rot_set_bone",        # 3 — Set bone rotation
    "0xd549": "rot_get_bone",        # 3 — Get bone rotation
    "0xd54a": "rot_set_absolute",    # 4 — Set absolute rotation
    "0xd54b": "rot_get_absolute",    # 5 — Get absolute rotation
    "0xd54c": "rot_set_relative",    # 3 — Set relative rotation
    "0xd54d": "rot_get_relative",    # 6 — Get relative rotation
    "0xd54e": "rot_transform",       # 4 — Apply rotation transform
    "0xd54f": "rot_compose",         # Compose rotations
    "0xd550": "rot_decompose",       # 4 — Decompose rotation
    "0xd553": "rot_normalize",       # 3 — Normalize rotation
    "0xd555": "rot_align_up",        # 8 — Align to up vector
    "0xd558": "rot_align_forward",   # 3 — Align to forward vector
    "0xd560": "rot_set_yaw",         # 3 — Set yaw angle
    "0xd561": "rot_get_yaw",         # 5 — Get yaw angle
    "0xd565": "rot_set_pitch",       # 6 — Set pitch angle
    "0xd566": "rot_get_pitch",       # 5 — Get pitch angle
    "0xd568": "rot_set_roll",        # 4 — Set roll angle
    "0xd56a": "rot_get_roll",        # 5 — Get roll angle
    "0xd56b": "rot_set_tilt",        # 4 — Set tilt
    "0xd56d": "rot_get_tilt",        # 3 — Get tilt
    "0xd56e": "rot_set_lean",        # 4 — Set lean angle
    "0xd570": "rot_get_lean",        # 3 — Get lean angle
    "0xd573": "rot_set_twist",       # 2 — Set twist
    "0xd574": "rot_get_twist",       # 6 — Get twist
    "0xd576": "rot_set_bank",        # 2 — Set bank angle
    "0xd578": "rot_get_bank",        # 3 — Get bank angle
    "0xd57a": "rot_set_sway",        # 2 — Set sway
    "0xd57c": "rot_set_pivot_pt",    # 8 — Set rotation pivot point
    "0xd57d": "rot_get_pivot_pt",    # Get rotation pivot point
    "0xd57e": "rot_set_center",      # 3 — Set rotation center
    "0xd580": "rot_get_center",      # Get rotation center
    "0xd581": "rot_set_radius",      # 2 — Set rotation radius
    "0xd582": "rot_get_radius",      # 2 — Get rotation radius
    "0xd583": "rot_set_orbit",       # 3 — Set orbit parameters
    "0xd585": "rot_get_orbit",       # Get orbit parameters
    "0xd586": "rot_set_phase",       # 2 — Set rotation phase
    "0xd588": "rot_get_phase",       # 2 — Get rotation phase
    "0xd58a": "rot_set_frequency",   # 3 — Set rotation frequency
    "0xd58c": "rot_get_frequency",   # 3 — Get rotation frequency
    "0xd58e": "rot_set_amplitude",   # 2 — Set rotation amplitude
    "0xd58f": "rot_get_amplitude",   # Get rotation amplitude
    "0xd590": "rot_lerp_start",      # 2 — Begin rotation lerp
    "0xd593": "rot_lerp_update",     # 3 — Update rotation lerp
    "0xd598": "rot_lerp_speed",      # Rotation lerp speed
    "0xd599": "rot_lerp_time",       # 2 — Rotation lerp duration
    "0xd59a": "rot_lerp_ease",       # 2 — Rotation lerp easing
    "0xd59b": "rot_lerp_curve",      # 5 — Rotation lerp curve
    "0xd59d": "rot_lerp_done",       # Check if lerp complete
    "0xd59e": "rot_lerp_cancel",     # 2 — Cancel rotation lerp
    "0xd5a0": "rot_oscillate",       # 2 — Oscillating rotation
    "0xd5a2": "rot_wobble",          # Wobble rotation
    "0xd5a6": "rot_shake",           # Shake rotation
    "0xd5a9": "rot_jitter",          # 5 — Jitter rotation
    "0xd5aa": "rot_noise",           # 3 — Noise-based rotation
    "0xd5ac": "rot_face_camera",     # Rotate to face camera
    "0xd5b1": "rot_billboard",       # 2 — Billboard rotation
    "0xd5b3": "rot_align_terrain",   # 2 — Align to terrain normal
    "0xd5b4": "rot_face_player",     # 2 — Rotate to face player
    "0xd5b6": "rot_track_target",    # 3 — Track target rotation
    "0xd5b7": "rot_align_normal",    # 6 — Align to surface normal
    "0xd5bd": "rot_set_follow",      # Set follow rotation
    "0xd5be": "rot_get_follow",      # 2 — Get follow rotation
    "0xd5c0": "rot_set_aim",         # 4 — Set aim direction
    "0xd5c1": "rot_get_aim",         # 3 — Get aim direction
    "0xd5c2": "rot_set_aim_speed",   # 2 — Set aim speed
    "0xd5c5": "rot_set_aim_weight",  # 3 — Set aim blend weight
    "0xd5c8": "rot_set_constraint_axis", # 2 — Set constraint axis
    "0xd5c9": "rot_get_constraint_axis", # 3 — Get constraint axis
    "0xd5ce": "rot_set_lock",        # 5 — Lock rotation axis
    "0xd5cf": "rot_unlock",          # 2 — Unlock rotation axis
    "0xd5d0": "rot_set_angle_limits",# 3 — Set angle limits
    "0xd5d5": "rot_set_swing",       # 2 — Set swing limits
    "0xd5d6": "rot_get_swing",       # 3 — Get swing limits
    "0xd5d7": "rot_set_cone",        # 5 — Set cone constraint
    "0xd5dd": "rot_set_hinge",       # 2 — Set hinge constraint
    "0xd5e0": "rot_set_ball",        # 3 — Set ball joint
    "0xd5e3": "rot_set_socket",      # 2 — Set socket joint
    "0xd5e4": "rot_set_tilt_angle",  # 7 — Set tilt angle
    "0xd5e5": "rot_get_tilt_angle",  # 2 — Get tilt angle
    "0xd5ec": "rot_reset",           # Reset rotation to default

    # ---- Category 0xD6: Scale/visibility (39 calls) ----
    "0xd608": "scale_get_x",         # Get X scale
    "0xd609": "scale_get_y",         # Get Y scale
    "0xd60a": "scale_get_z",         # Get Z scale
    "0xd60e": "scale_set_x",         # 2 — Set X scale
    "0xd60f": "scale_set_y",         # 2 — Set Y scale
    "0xd610": "scale_set_z",         # Set Z scale
    "0xd611": "scale_set_xyz",       # Set all scale components
    "0xd612": "scale_get_xyz",       # Get all scale components
    "0xd619": "scale_set_uniform",   # Set uniform scale
    "0xd61f": "scale_lerp",          # 3 — Interpolate scale
    "0xd620": "scale_set_anim",      # Animate scale
    "0xd623": "scale_set_parent",    # 2 — Set parent scale
    "0xd625": "scale_inherit",       # Inherit parent scale
    "0xd62b": "scale_set_bone",      # Set bone scale
    "0xd62f": "scale_set_morph",     # Set morph target scale
    "0xd631": "scale_get_morph",     # Get morph target scale
    "0xd635": "scale_set_weight",    # Set scale blend weight
    "0xd637": "scale_get_weight",    # Get scale blend weight
    "0xd63b": "scale_set_min",       # Set minimum scale
    "0xd63d": "scale_set_max",       # Set maximum scale
    "0xd63e": "scale_uniform",       # Uniform scale (single float)
    "0xd640": "scale_reset",         # Reset scale
    "0xd643": "scale_pulse",         # Pulsing scale effect
    "0xd64a": "scale_set",           # 2 — Set scale (XYZ)
    "0xd64b": "scale_get",           # Get scale (XYZ)
    "0xd64c": "scale_multiply",      # Multiply scale
    "0xd656": "scale_set_node",      # Set node scale
    "0xd65e": "scale_set_mesh",      # Set mesh scale
    "0xd65f": "scale_get_mesh",      # Get mesh scale
    "0xd682": "scale_set_lod",       # Set LOD scale
    "0xd684": "scale_get_lod",       # Get LOD scale
    "0xd689": "scale_set_shadow",    # Set shadow scale
    "0xd690": "scale_set_bounds",    # Set bounds scale

    # ---- Category 0xD7: Visibility/display (5 calls) ----
    "0xd708": "vis_get",             # Get visibility state
    "0xd717": "vis_set_alpha",       # Set alpha/transparency
    "0xd71b": "vis_set_layer",       # Set render layer
    "0xd72f": "vis_set_draw_order",  # Set draw order
    "0xd74a": "vis_toggle",          # Toggle visibility on/off

    # ---- Category 0xE0: Environment/lighting (17 calls) ----
    "0xe04c": "env_set_light",       # 8 — Set light parameters
    "0xe050": "env_set_ambient",     # 8 — Set ambient lighting
    "0xe074": "env_set_fog",         # Set fog parameters

    # ---- Category 0xE4: Entity init (305 calls) ----
    # Maps to EV_CreateCharacter in event_sdk
    "0xe400": "entity_init",         # 125 — Initialize entity (create slot)
    "0xe402": "entity_init_type",    # 88 — Init with type specifier
    "0xe404": "entity_init_model",   # 31 — Init and bind to MT5 model
    "0xe405": "entity_init_model_ex",# 2 — Init model extended
    "0xe407": "entity_init_anim",    # Init with animation
    "0xe408": "entity_init_npc",     # 2 — Init NPC entity
    "0xe409": "entity_init_npc_ex",  # 2 — Init NPC extended
    "0xe40a": "entity_init_object",  # 4 — Init interactive object
    "0xe40d": "entity_init_cfg",     # 5 — Init with config block
    "0xe414": "entity_init_child",   # 5 — Init as child of parent
    "0xe418": "entity_init_group",   # 2 — Init entity group
    "0xe41e": "entity_init_at_pos",  # 17 — Init at specific position
    "0xe420": "entity_init_at_node", # Init at scene node
    "0xe428": "entity_init_linked",  # Init linked to another entity
    "0xe42d": "entity_init_attached",# Init attached to parent
    "0xe437": "entity_init_dynamic", # Init dynamic physics entity
    "0xe43c": "entity_init_static",  # 9 — Init static (non-moving) object
    "0xe450": "entity_init_trigger", # 2 — Init trigger zone
    "0xe464": "entity_init_camera",  # 5 — Init camera entity
    "0xe474": "entity_init_light",   # Init light entity
    "0xe4ff": "entity_cleanup",      # Cleanup/dispose entity

    # ---- Category 0xE5: Entity activate/config (896 calls) ----
    # Maps to EV_EnableCharDisplay, SetCEWPFlags in event_sdk
    "0xe500": "entity_activate",     # 125 — Activate (make live in scene)
    "0xe501": "entity_activate_ex",  # 47 — Activate with params
    "0xe502": "entity_activate_cfg", # 21 — Activate with config
    "0xe503": "entity_activate_anim",# 19 — Activate with animation
    "0xe504": "entity_activate_model",# 2 — Activate with model
    "0xe505": "entity_activate_npc", # 3 — Activate NPC
    "0xe508": "entity_set_visible",  # 2 — Set entity visible
    "0xe509": "entity_set_active",   # 33 — Set entity active state
    "0xe50a": "entity_deactivate",   # 5 — Deactivate entity
    "0xe50b": "entity_destroy",      # Destroy entity
    "0xe50c": "entity_set_priority", # 13 — Set update priority
    "0xe50e": "entity_suspend",      # 7 — Suspend entity processing
    "0xe511": "entity_resume",       # 6 — Resume entity processing
    "0xe512": "entity_set_sleep",    # 2 — Set sleep state
    "0xe518": "entity_set_collision",# 9 — Set collision enabled
    "0xe519": "entity_enable",       # 83 — Enable entity
    "0xe51b": "entity_disable",      # 26 — Disable entity
    "0xe51c": "entity_set_interact", # Set interaction mode
    "0xe51d": "entity_set_lod",      # 78 — Set level-of-detail
    "0xe51f": "entity_set_shadow",   # 8 — Enable/disable shadow
    "0xe526": "entity_set_collider", # Set collision shape
    "0xe529": "entity_set_physics",  # 23 — Set physics mode
    "0xe52b": "entity_set_gravity",  # Set gravity enabled
    "0xe52c": "entity_set_mass",     # 19 — Set physics mass
    "0xe52d": "entity_set_friction", # 4 — Set friction
    "0xe52e": "entity_set_bounce",   # 5 — Set bounce/restitution
    "0xe53b": "entity_set_group",    # Set entity group
    "0xe53d": "entity_set_layer",    # 7 — Set render layer
    "0xe546": "entity_set_tag",      # 4 — Set entity tag
    "0xe547": "entity_get_tag",      # 2 — Get entity tag
    "0xe549": "entity_set_name",     # 7 — Set entity name
    "0xe54b": "entity_get_name",     # Get entity name
    "0xe54f": "entity_set_parent",   # 25 — Set parent entity
    "0xe550": "entity_get_parent",   # 17 — Get parent entity
    "0xe551": "entity_set_child",    # 11 — Set child entity
    "0xe553": "entity_get_child",    # Get child entity
    "0xe554": "entity_set_sibling",  # Set sibling entity
    "0xe558": "entity_set_callback", # 8 — Set entity callback
    "0xe559": "entity_set_trigger",  # 29 — Set trigger zone
    "0xe55e": "entity_set_property", # 146 — Set entity property (HUGE)
    "0xe563": "entity_get_property", # 3 — Get entity property
    "0xe564": "entity_set_flag",     # 5 — Set entity flag
    "0xe56c": "entity_set_timer",    # 4 — Set entity timer
    "0xe56d": "entity_set_state",    # 57 — Set entity state machine
    "0xe56e": "entity_get_state",    # Get entity state
    "0xe570": "entity_set_ai",       # Set AI behavior
    "0xe574": "entity_set_behavior", # Set behavior tree
    "0xe575": "entity_set_script",   # 19 — Set entity script
    "0xe578": "entity_set_event",    # Set event handler

    # ---- Category 0xE6: Entity linking (5 calls) ----
    "0xe600": "link_create",         # 3 — Create entity link
    "0xe602": "link_set_type",       # Set link type
    "0xe626": "link_attach",         # Attach entities

    # ---- Category 0xE7: Entity hierarchy (15 calls) ----
    # Maps to EV_HLKillOtherHierarchyTask in event_sdk
    "0xe700": "hierarchy_detach",    # 10 — Detach from hierarchy
    "0xe701": "hierarchy_destroy",   # 2 — Destroy hierarchy
    "0xe708": "hierarchy_set_root",  # 3 — Set hierarchy root

    # ---- Category 0xEC: Cutscene/event (8 calls) ----
    # Maps to LoadCutscene, LoadEvent in event_sdk
    "0xecd4": "cutscene_set_camera", # 4 — Set cutscene camera
    "0xece0": "cutscene_play",       # 2 — Play cutscene
    "0xece4": "cutscene_load",       # 2 — Load cutscene data

    # ---- Category 0xF0: System (1 call) ----
    "0xf000": "sys_reset",           # System reset

    # ---- Category 0xFF: Termination/sentinel (7 calls) ----
    "0xfff8": "end_block",           # End code block
    "0xfffb": "end_function",        # End function
    "0xfffd": "end_script",          # 2 — End script section
    "0xfffe": "end_scene",           # End scene
    "0xffff": "end_program",         # 2 — End program

    # ---- Scene flow ----
    "0xf9":   "scene_transition",    # Transition to next scene

    # ---- 8-bit operand categories (single-byte calls) ----
    # These are the category dispatch with no sub-op (8-bit opcode 0x1D nn)
    "0xd1":   "move_dispatch",       # 33 — movement dispatch
    "0xd4":   "pos_dispatch",        # 4 — position dispatch
    "0xd5":   "rot_dispatch",        # 22 — rotation dispatch
    "0xd6":   "scale_dispatch",      # 14 — scale dispatch
    "0xd7":   "vis_dispatch",        # 3 — visibility dispatch
    "0xe0":   "env_dispatch",        # 3 — environment dispatch
    "0xe4":   "entity_init_dispatch",# 3 — entity init dispatch
    "0xe5":   "entity_cfg_dispatch", # 16 — entity config dispatch
    "0xe6":   "link_dispatch",       # 3 — link dispatch
    "0xf2":   "wait_frames",         # 39 — wait N frames (yield)
    "0xf9":   "scene_transition",    # 2 — transition to next scene
    "0x24":   "set_timer",           # 4 — set timer
    "0x54":   "get_timer",           # 2 — get timer
    "0x01":   "begin_block",         # 8 — begin code block
    "0x04":   "sync_point",          # 2 — synchronization point
    "0x07":   "end_frame",           # 1 — end frame processing
    "0x16":   "set_priority",        # 1 — set execution priority

    # ---- Additional observed 16-bit ops ----
    "0x0385": "sys_debug_print",     # 76 — debug output
    "0x0404": "sys_get_flags",       # 22 — get system flags
    "0xd105": "move_get_speed",      # 15 — get movement speed
    "0xd512": "rot_set_blend_weight",# 17 — set rotation blend weight
    "0xd513": "rot_get_blend_weight",# 17 — get rotation blend weight
    "0xd517": "rot_set_track",       # 23 — set rotation tracking
    "0xd519": "rot_set_follow_speed",# 17 — set follow rotation speed
    "0xd51b": "rot_set_auto",        # 17 — set auto-rotation
    "0xd51d": "rot_get_auto",        # 13 — get auto-rotation
    "0xd528": "rot_set_ik_weight",   # 21 — set IK blend weight

    # ---- Misc/legacy ----
    "0x0":    "noop",                # No-op / placeholder
    "0x158b": "get_distance",        # Get distance to target
    "0x8d50": "set_event_handler",   # Set event handler callback
}

# ================================================================
# Function Set 6 (140A4F1F0): 47 SCNF scene flow functions
# stCAMERA, stMOVE, stMOTION, stVOICE, stSE from SEQCONV.C
# ================================================================
SET6_VERBS = {
    # PC port: 47 functions at 140A4F1F0 (SCNF scene flow)
    # Cross-ref: sub_140191580 (idx 0), sub_1401915C0 (idx 1), etc.
    "0x0":    "scnf_camera",         # 204 calls — primary camera control (stCAMERA)
    "0x1":    "scnf_camera_cut",     # 26 — hard camera cut
    "0x2":    "scnf_camera_lerp",    # 14 — smooth camera transition
    "0x3":    "scnf_camera_follow",  # 36 — camera follow target
    "0x54":   "scnf_set_timer",      # 18 — set scene timer
    "0x7d":   "scnf_trigger",        # 62 — scene trigger
    "0x8b":   "scnf_get_state",      # 9 — get scene state
    "0xac":   "scnf_set_ambient",    # 7 — set ambient
    "0xe0":   "scnf_set_environment",# 10 — set environment
    "0xe6":   "scnf_link",           # 8 — scene link
    "0xff":   "scnf_end",            # 7 — end scene block
    "0x154":  "scnf_set_weather",    # 21 — set weather mode
    "0x254":  "scnf_set_weather_ex", # 10 — set weather extended
    "0x384":  "scnf_set_boundary",   # 14 — boundary setup
    "0xd1":   "scnf_set_move",       # 23 — scene-level movement
    "0xd4":   "scnf_set_position",   # 12 — scene-level position
    "0xd5":   "scnf_set_rotation",   # 37 — scene-level rotation
    "0xd6":   "scnf_set_scale",      # 17 — scene-level scale
    "0xd7":   "scnf_set_visibility", # Scene-level visibility
    "0xe4":   "scnf_init_entity",    # 129 — init entity from scene
    "0xe5":   "scnf_activate",       # 32 — scene activation
    "0xe7":   "scnf_hierarchy",      # 17 — hierarchy operation
    "0x2855": "scnf_set_time",       # 11 — set time of day
    "0x9cd6": "scnf_set_scale_ex",   # 8 — set scale extended
    "0xd37d": "scnf_set_path",       # 15 — set scene path
    "0xe756": "scnf_hierarchy_cfg",  # 6 — hierarchy config
    "0xece5": "scnf_activate_cutscene",# 9 — activate cutscene
    "0x3d1":  "scnf_camera_track",   # Camera tracking mode
    "0x4e5":  "scnf_camera_shake",   # Camera shake effect
    "0x67e6": "scnf_set_lighting",   # 57 — set scene lighting
    "0x8ad5": "scnf_load_model",     # 11 — load scene model
    "0x8ae5": "scnf_load_resource",  # 22 — load scene resource
    "0x9ce4": "scnf_init_batch",     # Batch entity init
    "0xb20000":"scnf_set_area",      # 10 — set area
    "0xbd4":  "scnf_set_bounds",     # Boundary setup
    "0xece4": "scnf_load_cutscene",  # 28 — load cutscene data
    "0x1000000":"scnf_scene_load",   # 22 — load scene
    "0x4000000":"scnf_scene_load_ex",# 10 — load scene extended
    "0x7000000":"scnf_scene_load_7", # 9 — load scene variant
    "0x1c7ff":"scnf_fade",           # Screen fade in/out
}

# ================================================================
# Function Set 3 (140559CD0): 466 general Shenmue functions
# These are the game's core API — dialogue, inventory, flags, time, etc.
# ================================================================
SET3_VERBS = {
    # PC port: 466 functions at 140559CD0 ("General Shenmue stuff")
    # Opcodes 0x1B/0x2B/0x3B -> ShenmueFunc (CALL_SSF in Ghidra slaspec)
    # Cross-ref with event_tbl.h: idx 0=FUN_0c152360, idx 5=EV_NPC_NewLoadSw, etc.
    "0x0":      "sm_get_state",       # 47 — get game state
    "0x1":      "sm_set_flag",        # 6 — set game flag
    "0x2":      "sm_get_flag",        # 6 — get game flag
    "0x9f":     "sm_check_condition", # Check condition
    "0xd1":     "sm_move",            # 36 — movement operation
    "0xd4":     "sm_set_position",    # 14 — set position
    "0xd5":     "sm_set_rotation",    # 39 — set rotation
    "0xd6":     "sm_set_scale",       # 13 — set scale
    "0xd7":     "sm_set_visibility",  # 6 — set visibility
    "0xe0":     "sm_set_environment", # 19 — environment settings
    "0xe4":     "sm_init_entity",     # 17 — init entity
    "0xe5":     "sm_entity_op",       # 15 — entity operation
    "0x1cd1":   "sm_path_follow",     # 11 — follow path
    "0x5255":   "sm_get_time",        # 5 — get time of day
    "0x8ad5":   "sm_load_model",      # 9 — load model
    "0x8ae5":   "sm_load_resource",   # 13 — load resource
    "0xbd07":   "sm_set_dialog",      # Set dialog state
    "0xbd87":   "sm_get_dialog",      # Get dialog state
    "0x3d87":   "sm_check_dialog",    # Check dialog state
    "0x3e07":   "sm_set_npc_state",   # Set NPC state
    "0x1687":   "sm_get_npc_state",   # Get NPC state
    "0xece4":   "sm_load_cutscene",   # 5 — load cutscene
    "0xffff":   "sm_end",             # 4 — end marker
    "0xb20000": "sm_set_area",        # 11 — set area/scene
    "0x3d1":    "sm_camera_track",    # 4 — camera tracking
    "0x8d508ad5":"sm_load_and_bind",  # 5 — load and bind model
}

# ================================================================
# Function Set 4 (140A4F1E0): Extension calls
# Frequency: 0x35=13, 0x34=7, 0x0=7, 0x7d=4, 0x134=4
# ================================================================
SET4_VERBS = {
    # PC port: 1 function at 140A4F1E0 (extension dispatch)
    # But takes sub-operation codes like Set 7
    "0x0":         "ext_noop",              # 269 — no-op / sync point
    "0x1":         "ext_begin",             # 64 — begin extension block
    "0x34":        "ext_configure",         # 343 — configure entity
    "0x35":        "ext_load_model",        # 918 — load MT5 model (HUGE)
    "0x36":        "ext_place_model",       # 85 — place model in scene
    "0x7d":        "ext_trigger",           # 150 — trigger event
    "0xd1":        "ext_move",              # 34 — move entity
    "0xd5":        "ext_rotate",            # 28 — rotate entity
    "0xe4":        "ext_init_entity",       # 91 — init entity
    "0x134":       "ext_set_property",      # 39 — set property
    "0x434":       "ext_set_property_ex",   # 212 — set property extended
    "0x834":       "ext_set_property_8",    # 200 — set property (8-bit)
    "0x435":       "ext_get_property",      # 39 — get property
    "0x835":       "ext_get_property_8",    # 29 — get property (8-bit)
    "0x1534":      "ext_set_config",        # 55 — set config
    "0xe034":      "ext_entity_config",     # 66 — entity config
    "0xff35":      "ext_load_model_cfg",    # 49 — load model with config
    "0xece4":      "ext_load_cutscene",     # 27 — load cutscene
    "0x6ed37d":    "ext_place_with_offset", # 26 — place model with offset
    "0x1000000":   "ext_scene_load",        # 529 — load scene (HUGE)
    "0xf9":        "ext_transition",        # Scene transition
    "0xfb":        "ext_fire_event",        # Fire event
    # Additional high-frequency observed operands
    "0x37":        "ext_place_model_cfg",   # 18 — place model with config
    "0x234":       "ext_set_property_2",    # 22 — set property variant 2
    "0x235":       "ext_get_property_2",    # 19 — get property variant 2
    "0xd6":        "ext_set_scale",         # 17 — set scale
    "0xe5":        "ext_activate",          # 14 — activate entity
    "0xe7":        "ext_hierarchy",         # 15 — hierarchy operation
    "0xd34":       "ext_configure_d",       # 20 — configure variant D
    "0x1234":      "ext_set_property_12",   # 13 — set property variant 12
    "0x1434":      "ext_set_property_14",   # 14 — set property variant 14
    "0x4634":      "ext_set_property_46",   # 21 — set property variant 46
    "0xe334":      "ext_entity_config_e3",  # 16 — entity config variant E3
    "0xe534":      "ext_entity_config_e5",  # 13 — entity config variant E5
    "0xe734":      "ext_entity_config_e7",  # 15 — entity config variant E7
    "0x434ece4":   "ext_load_cutscene_cfg", # 15 — load cutscene with config
    "0x36ed37d":   "ext_place_with_path",   # 15 — place model on path
}

# ================================================================
# AREA ID -> NAME MAPPING
# SM1: from mapids-sm1.md, SM2: from mapids-sm2.md
# ================================================================
AREA_NAMES = {
    # SM1 areas
    0x01: "SAKURAGAOKA",   # JD00
    0x10: "DOJO",          # Hazuki Dojo
    0x12: "HOUSE",         # JOMO - Hazuki Residence Interior
    0x14: "YAMANOSE",      # JU00
    0x15: "HAZUKI_EXT",    # JHD0 - Hazuki Exterior
    0x20: "DOBUITA",       # D000
    0x30: "HARBOR",        # MFSY
    0x99: "WAREHOUSE_8",   # MS08
}

# 4-char map IDs -> human-readable location names
# Used to resolve string references in bytecode
MAP_ID_NAMES = {
    # SM1 (mapids-sm1.md)
    "JOMO": "Hazuki Residence Interior",
    "JD00": "Sakuragaoka",
    "JU00": "Yamanose",
    "JHD0": "Hazuki Residence Exterior",
    "D000": "Dobuita",
    "MFSY": "Harbor (Main)",
    "MA00": "Harbor (Forklift)",
    "MS08": "Warehouse No. 8",
    "DGCT": "YOU Arcade",
    "DBYO": "Bar Yokosuka",
    "DPIZ": "Bob's Pizzeria",
    "DCBN": "Tomato Convenience Store",
    "DRME": "Manpukuken Ramen",
    "DJAZ": "MJQ Jazz Bar",
    "DSLT": "Slot House",
    "DMAJ": "Daisangen Mahjong",
    "DURN": "Lapis Fortune Teller",
    "DKTY": "Antique Shop",
    "DRSA": "Russiya China Shop",
    "DSLI": "Bar Linda",
    "DBHB": "Heartbeats Bar",
    "DKPA": "Nana's Karaoke Bar",
    "MKYU": "Harbor Lounge",
    "MKSG": "Old Warehouse District",
    "YDB1": "Hazuki Basement",
    "OP00": "Intro Cutscenes",
    # SM1 additional (Knowledgebase/Shenmue_I/Map_Names_IDs.md)
    "JABE": "Abe Store Candy Shop",
    "DCHA": "Ajiichi Chinese Restaurant",
    "ARAR": "Asia Travel Company",
    "DAZA": "Asia Travel Company (dup)",
    "DSKI": "Global Travel Agency",
    "DRHT": "Liu's Barber and Hair Salon",
    "DTKY": "Maeda Barber Shop",
    "DYKZ": "Nagai Industries",
    "DSBA": "Yamaji Soba Noodles",
    "DSUS": "Takara Sushi",
    "TATQ": "Tattoo Parlor",
    "MFBT": "Harbor (70 Man Battle)",
    "MEND": "Harbor (Fight + Ending)",
    "M3FB": "Harbor (Mad Angels Ambush)",
    "MC5Q": "Harbor (Shadow Step)",
    "YDMA": "Hazuki Ext (Ending)",
    "MSBS": "Hazuki Ext (Dojo Cutscene)",
    "BETD": "Hazuki Ext (Bad Ending)",
    "DNOZ": "Sakuragaoka (dup)",
    "GMCT": "YOU Arcade (dup)",
    "DHQB": "Heartbeats Bar (dup)",
    "YQ14": "Heartbeats Alley QTE",
    "MBQC": "Unknown Cutscene",
    "MS8A": "Warehouse No. 8 (dup)",
    "MS8S": "Warehouse No. 8 (dup2)",
    "MO99": "Warehouse No. 8 (dup3)",
    # SM2 Aberdeen (Knowledgebase/Shenmue_II/Map_Names_IDs.md)
    "AK00": "Fortune's Pier",
    "AK09": "Fortune's Pier (copy)",
    "AKS0": "Fortune's Eatery",
    "AKS1": "Blue Sky",
    "AKT0": "Gambling Warehouse 0",
    "AKT1": "Gambling Warehouse 1",
    "AKT2": "Gambling Warehouse 2",
    "AKT3": "Gambling Warehouse 3",
    "AKY0": "Warehouse F",
    "AB00": "Beverly Hills Wharf",
    "AR01": "Worker's Pier",
    "AR02": "Worker's Pier (docks)",
    "AR03": "Queen's Street",
    "AR09": "Queen's Street (copy)",
    "ARA0": "Bar Swing",
    "ARC0": "Pigeon Cafe",
    "ARM0": "Hong Kong Souvenirs",
    "ARSF": "Rooftop Fight",
    "ARZ0": "General Store",
    # SM2 Wan Chai
    "WB00": "Scarlet Hills",
    "WB01": "Man Mo Temple",
    "WBBK": "Scarlet Hills (Airing Books)",
    "WE00": "Golden Quarter",
    "WECF": "Moon Cafe",
    "WEG0": "Pine Game Arcade",
    "WEM1": "S.I.C. Pool Hall",
    "WES1": "Slot House W",
    "WET0": "Tomato Convenience Store (WC)",
    "WK00": "South Carmain Quarter",
    "WK09": "South Carmain Quarter (copy)",
    "WKA0": "Yan Tin Apartments",
    "WN00": "Lucky Charm Quarter",
    "WR00": "White Dynasty Quarter",
    "WRS2": "Bar Liverpool",
    "WS00": "Green Market Quarter",
    "WS09": "Green Market Quarter (copy)",
    "WSG1": "Guang Martial Arts School",
    "WSY0": "Come Over Guest House",
    "WT00": "Wise Mens Quarter",
    "WTA0": "Da Yuan Apartments",
    # SM2 Kowloon
    "Q100": "Thousand White Quarter",
    "Q109": "Thousand White Quarter (copy)",
    "Q200": "Stand Quarter",
    "Q300": "Dimsum Quarter",
    "QA00": "Three Birds Building",
    "QA11": "Three Birds Roof",
    "QA22": "Slot House K",
    "QAE1": "Three Birds/Tea Break 1F",
    "QAE6": "Three Birds/Tea Break 6F",
    "QAW1": "Dancing Dragon/Dimsum Bldg",
    "QAW6": "Dancing Dragon/Dimsum 6F",
    "QB00": "Great View Building",
    "QBAA": "Great View Herbs",
    "QC00": "Thousand White Building",
    "QC01": "Thousand White Building 1F",
    "QC06": "Thousand White Building 6F",
    "QCAE": "Thousand White Warehouse",
    "QD00": "Ghost Hall Building",
    "QD01": "God of Wealth Building",
    "QDKJ": "Five Stars Corp (Yuanda Zhu)",
    "QE00": "Moon Child Building",
    "QE01": "Moon Child Building (copy)",
    "QE03": "Golden Flower Building",
    "QE09": "Black Heaven Building",
    "QEDJ": "Yuan's Room",
    "QEEC": "Kai's Room",
    "QEHI": "Moon Child Orphanage",
    "QF00": "Yellow Head Building",
    "QF01": "Yellow Head 1-2F",
    "QF02": "Yellow Head 3-4F",
    "QF39": "Yellow Head 40F",
    "QF40": "Dou Niu's Room",
    "QFHG": "Hang On Room",
    "QFRR": "Yellow Head Rooftop",
    "QGBT": "Blue Dragon Garden",
    "QJBT": "Phoenix Building",
    "QKBT": "Big Ox Building B5F",
    "QLBT": "Black Heaven Building (copy)",
    "QR00": "Dragon Street",
    "QR09": "Dragon Street (copy)",
    "QRC0": "Huang's Room",
    "QRR0": "Ren's Hideout",
    "QSFA": "Former Barracks",
    "QSFB": "Small Dragon Garden",
    "QSFC": "Star Gazing Point",
    "QSFD": "Construction Base",
    "QTB1": "Former Factory Site",
    "QTB2": "Old Government Office",
    "QTB3": "Thunder House",
    "QTB4": "Fighting Place",
    "QUG0": "Underground",
    "QAXX": "Handcuff QTE Jump",
    # SM2 Guilin
    "KES1": "Stone Pit",
    "KMZ1": "Forest 1",
    "KMZ2": "Forest 2",
    "KMZ3": "Forest 3",
    "KMZ4": "Forest 4",
    "KRF1": "Kowloon Intro",
    "KRH1": "Langhuishan",
    "KSH1": "Shenhua's House",
    "KWM1": "Green Field",
    "KWW1": "Path Through a Wood",
    "KWW4": "Cloud Bird Trail",
}

# ================================================================
# KNOWN FLAGS & MEMORY ALIASES
# From Memory Addresses (SM1).md, Memory Addresses (SM2).md,
# and Function Memory Addresses (SM2).md
# ================================================================
KNOWN_FLAGS = {
    # Story/Quest
    "0x524e": "FLAG_STORY_PROGRESS",
    "0x5255": "FLAG_TIME_OF_DAY",
    "0x65d6": "SCENE_FLAGS",
    "0xc073": "PLAYER_INTERACT",
    "0xf5":   "GREET_GENERIC",

    # Common small constants
    "0x0":  "0",
    "0x1":  "1",
    "0x2":  "2",
    "0x3":  "3",
    "0x4":  "4",
    "0x5":  "5",
    "0x6":  "6",
    "0x7":  "7",
    "0x8":  "8",
    "0x9":  "9",
    "0xa":  "10",
    "0xb":  "11",
    "0xc":  "12",
    "0xd":  "13",
}

# ================================================================
# KNOWN MEMORY OFFSETS (from Memory Addresses SM1/SM2 docs)
# Used to annotate MOBJ read/write operations that access
# documented game state structures.
# ================================================================
KNOWN_MEMORY_OFFSETS = {
    # MOBJ cycle pointer offsets (platform-agnostic, same DC and PC)
    0x08: "player.pos_x",
    0x0C: "player.pos_z",
    0x10: "player.pos_y",
}

# ================================================================
# DREAMCAST GAME STATE ADDRESSES
# Source: Shenmue Patch Code Guide (SSJ2 Dark) — DC RAM addresses
# These are absolute Dreamcast RAM addresses for the save/inventory
# state block. Used to annotate global_flags[] accesses.
# ================================================================
DC_GAME_STATE = {
    # General
    0x220A38: "funds",                    # Yen amount (32-bit)
    0x220A3C: "tokens",                   # Token count (32-bit)
    # Quest Items (0x221A85-0x221A8B)
    0x221A85: "item.cassette_player",
    0x221A86: "item.letter_to_father",
    0x221A87: "item.watch",
    0x221A88: "item.sword_handguard",
    0x221A89: "item.phoenix_mirror",
    0x221A8A: "item.chen_intro_letter",
    0x221A8B: "item.amulet",
    # Saturn Games
    0x221AA9: "item.hang_on",
    0x221AAA: "item.space_harrier",
    # Photographs (0x221A8C-0x221A94)
    0x221A8C: "photo.father",
    0x221A8D: "photo.friends",
    0x221A8E: "photo.nozomi_fair_close",
    0x221A8F: "photo.nozomi_cloudy_close",
    0x221A90: "photo.nozomi_cloudy_apart",
    0x221A91: "photo.nozomi_fair_apart",
    0x221A92: "photo.nozomi_snowy_close",
    0x221A93: "photo.nozomi_snowy_apart",
    0x221A94: "photo.hazuki_family",
    # Move Scrolls (0x221A95-0x221AA8, stride 2)
    0x221A95: "scroll.twin_blades",
    0x221A97: "scroll.shadow_reaper",
    0x221A99: "scroll.stab_armor",
    0x221A9B: "scroll.twin_swallow_leap",
    0x221A9D: "scroll.mud_spider",
    0x221A9F: "scroll.rising_flash",
    0x221AA1: "scroll.crawl_cyclone",
    0x221AA3: "scroll.tiger_storm",
    0x221AA5: "scroll.arm_break_fire",
    0x221AA7: "scroll.poetry_scroll",
    0x221AA8: "scroll.mysterious_scroll",
    # Maps (0x221AAF-0x221AB6)
    0x221AAF: "map.route_1",
    0x221AB0: "map.route_2",
    0x221AB1: "map.route_3",
    0x221AB2: "map.route_4",
    0x221AB3: "map.route_5",
    0x221AB4: "map.race_course",
    0x221AB5: "map.old_depot_original",
    0x221AB6: "map.old_depot_altered",
    # Trip Fliers
    0x221AAD: "flier.hong_kong",
    0x221AAE: "flier.bargain",
    # Household Items (0x221AB7-0x221ABC)
    0x221AB7: "household.flashlight",
    0x221AB8: "household.c_batteries",
    0x221AB9: "household.aa_batteries",
    0x221ABA: "household.candles",
    0x221ABB: "household.matches",
    0x221ABC: "household.light_bulbs",
    # Kitten Food (0x221ABD-0x221AC2)
    0x221ABD: "food.squid_legs",
    0x221ABE: "food.sliced_fish",
    0x221ABF: "food.milk",
    0x221AC0: "food.dried_fish",
    0x221AC1: "food.tuna",
    0x221AC2: "food.salami",
    # Snacks (0x221AC3-0x221AC5)
    0x221AC3: "snack.potato_chips",
    0x221AC4: "snack.chocolate",
    0x221AC5: "snack.caramel",
    # Winning Can
    0x221AC6: "winning_can_stock",
    # Collectables base (0x221CBC-0x221D60, 168 figures)
    0x221CBC: "collectables_base",
    # Hand Move Proficiencies (0x221B84-0x221BA4)
    0x221B84: "move.hand.tiger_knuckle",
    0x221B88: "move.hand.elbow_slam",
    0x221B8C: "move.hand.twist_knuckle",
    0x221B90: "move.hand.elbow_assault",
    0x221B94: "move.hand.upper_knuckle",
    0x221B98: "move.hand.sleeve_strike",
    0x221B9C: "move.hand.rain_thrust",
    0x221BA0: "move.hand.big_wheel",
    # Leg Move Proficiencies (0x221BD6-0x221BF0)
    0x221BD6: "move.leg.crescent_kick",
    0x221BD8: "move.leg.trample_kick",
    0x221BDC: "move.leg.side_reaper_kick",
    0x221BE0: "move.leg.tornado_kick",
    0x221BE4: "move.leg.surplice_slash",
    0x221BE8: "move.leg.thunder_kick",
    0x221BEC: "move.leg.hold_against_leg",
    0x221BF0: "move.leg.brutal_tiger",
    # Throw Move Proficiencies (0x221C28-0x221C40)
    0x221C28: "move.throw.overthrow",
    0x221C2C: "move.throw.sweep_throw",
    0x221C30: "move.throw.vortex_throw",
    0x221C34: "move.throw.mist_reaper",
    0x221C38: "move.throw.demon_drop",
    0x221C3C: "move.throw.shoulder_buster",
    0x221C40: "move.throw.tengu_drop",
    # Cassettes base (0x221DBC, stride 4)
    0x221DBC: "cassettes_base",
}

# ================================================================
# VOICE FILE SPEAKER PREFIXES
# Derived from SEQCONV.C VoiceID[] patterns:
#   ID_AKI = Ryo (Akira Yuki = player model internally)
#   ID_SARA, ID_CHI, ID_OTH = other characters
# Sound file naming: A1_XXXXX = Area 1 ambient/SFX
# ================================================================
VOICE_SPEAKERS = {
    "a1_tmryo": "Ryo",
    "a1_kawak": "Fuku-san",
    "a1_inet":  "Ine-san",
    "a1_neko":  "Cat",
    "a1_sakra": "Ambient_Sakuragaoka",
    "f1ryutok": "Ryo_Monologue",
    "f1jutadn": "Ryo_Reaction",
    "e1biche": "Cutscene_Voice",
}

# Binary 4-char tags -> character names
# Source: Knowledgebase/Shenmue_I/Characters_Names_IDs_Models.md (242 entries)
# + SEQCONV.C and 0154_1.C analysis
CHAR_ABBREVIATIONS = {
    # === Key story characters ===
    "AKIR": "Ryo Hazuki",
    "JAKR": "Ryo (Child)",
    "IWAO": "Iwao Hazuki",
    "INE_": "Ine-san",
    "FUKU": "Fuku-san",
    "HRSK": "Nozomi Harasaki",
    "SORY": "Lan Di",
    "CHAI": "Chai",
    "SINF": "Shenhua Ling",
    "TAIJ": "Master Chen",
    "KISY": "Guizhang Chen",
    "TOM_": "Tom Johnson",
    "BOB_": "Bob Dickson",
    "SMTH": "Smith Bradley",
    "TONY": "Tony Abrams",
    "TERY": "Terry Ryan",
    "JIMY": "Jimmy Yan",
    # === Sakuragaoka residents ===
    "KOND": "Fusako Kondo",
    "MISM": "Fusayo Mishima",
    "MEGM": "Megumi Mishima",
    "MAYM": "Mayumi Mishima",
    "SKRD": "Ichiro Sakurada",
    "ITOH": "Naoyuki Ito",
    "SGRH": "Suguru Hirano",
    "YAMA": "Shigeo Yamagishi",
    "SUMI": "Natsuki Sumiya",
    "TTYA": "Tatsuya Yamamoto",
    "SKMT": "Yohei Sakamoto",
    "NOMR": "Mitsugu Nomura",
    "KAME": "Kame Shibukawa",
    "SETA": "Setsu Abe",
    # === Dobuita merchants/residents ===
    "HIRA": "Haru Hirata",
    "MADA": "Ichiro Maeda",
    "KOMN": "Hiromi Komine",
    "HOND": "Soichi Honda",
    "HATR": "Mamoru Hattori",
    "HREO": "Harue Okuno",
    "NMTO": "Junichiro Nemoto",
    "JUKY": "Junko Yamamoto",
    "SOBA": "Kiyoshi Yamanaka",
    "OISI": "Keizo Oishi",
    "KURI": "Shiro Kurita",
    "TURU": "Noriyuki Tsuruoka",
    "AOKI": "Motoyuki Aoki",
    "MASR": "Masaru Aoi",
    "YOSE": "Yoshie Aoi",
    "ASOU": "Hiroshi Tamura",
    "SNKC": "Shinkichi Noda",
    "MRIG": "Mario Grianni",
    "NITO": "Yuji Nito",
    "AKMI": "Akemi Sato",
    "SAJO": "Teruhiko Saijo",
    "HATO": "Yoshifumi Hato",
    "YOKO": "Yoko Minato",
    "KYOH": "Kyoko Hayashi",
    "HRKO": "Hiroyuki Orihara",
    "NANS": "Nanako Shinohara",
    "MYKN": "Kirino Matsuyama",
    "MIKM": "Takafumi Mitsuzuka",
    "HIRI": "Takeshi Hirai",
    "SIND": "Satoshi Shinoda",
    "SERA": "Takeshi Sera",
    "ETKO": "Etsuko Sekine",
    "TOKI": "Toki Aida",
    "IZWA": "Midori Aizawa",
    "UDGW": "Kimie Udagawa",
    "TATM": "Ryuji Tatsumi",
    "AKSK": "Kazuo Akasaka",
    "HRNO": "Minako Hirano",
    "YOHI": "Yohei Kondo",
    "ENKI": "Akio Enoki",
    "SATM": "Santa Maeno",
    "HORS": "Takashi Takashiro",
    "CHRL": "Charlie Grant",
    "ONO_": "Goro Ono",
    "TSUC": "Shingo Mochizuki",
    "KJIY": "Koji Yabe",
    "NGAI": "Akira Nagai",
    "TOSK": "Toshiki Kagawa",
    "TTAY": "Tota Yoshino",
    "TYHG": "Toya Hasegawa",
    "KJHS": "Koji Hase",
    "DICK": "Dick Philips",
    "RYBI": "Lidia Bennett",
    "KYAS": "Cathy Wilkins",
    "NMNO": "Yumiko Minamino",
    "GJHM": "Gilbert Flakes",
    "GJBM": "Wilson Bonett",
    "GJBF": "Honey Jackson",
    "YKHI": "Wang Guang Ji",
    "GRKN": "Wu Li Xian",
    "ASDA": "Xia Xiu Yu",
    "KKBN": "Xie Gao Wen",
    "ONRR": "Liu En Ling",
    "KYUR": "Liu Ji You",
    "RKKI": "Liu Gong Hui",
    "RINS": "Lin Xiang Xuan",
    "UNO_": "Tao Duo Ji",
    "RNKT": "Tao Lin Xia",
    # === Harbor workers/residents ===
    "MARK": "Mark Kimberly",
    "GORO": "Goro Mihashi",
    "HISA": "Hisaka Sawano",
    "FKSM": "Kinuyo Sawano",
    "MEYS": "Mari Yamashita",
    "TMMR": "Tomi Maruyama",
    "HARY": "Harry Thompson",
    "ISDA": "Akihiro Ishida",
    "TAKE": "Hiroaki Takeuchi",
    "KWMT": "Hiroshi Kawamoto",
    "MURI": "Hiroshi Murai",
    "ASNO": "Haruo Asano",
    "SKGK": "Hideo Shiga",
    "NAKA": "Noboru Nakatani",
    "TAGW": "Kazuyuki Tagawa",
    "KYMA": "Azusa Kayama",
    "SAKI": "Saki Shirakura",
    "KUKT": "Kyoko Takai",
    "KOGA": "Wataru Koga",
    "KJMA": "Shigeru Kojima",
    "NRSK": "Kazuomi Narasaki",
    "KIM_": "Kim Shihan",
    "KUDO": "Susumu Kudo",
    "MITA": "Shinobu Mita",
    "ENDO": "Shozo Endo",
    "SYZU": "Shozo Mizuki",
    # === Forklift workers (FLDx) ===
    "FLD1": "Hiromasa Ono",
    "FLD2": "Osamu Ushio",
    "FLD3": "Seiji Uchishiro",
    "FLD4": "Shogo Sugai",
    "FLD5": "Koichi Tsuda",
    "FLD6": "Yasuomi Kujirai",
    "FLD7": "Atsushi Sayama",
    "FLD8": "Mitsuharu Koda",
    "FLD9": "Hiroshi Sugiyama",
    "FLDA": "Yasuo Kusano",
    "FLDB": "Takayoshi Hanazawa",
    "FLDC": "Naomi Koshiba",
    "FLDD": "Satoru Tsukakoshi",
    "FLDE": "Tomo Uemoto",
    "FLDF": "Shuichiro Ida",
    "FLDG": "Kyosuke Hatanaka",
    # === Harbor dock workers (KEBx) ===
    "KEBA": "Tadashi Akita",
    "KEBB": "Yasutomo Miyagi",
    "KEBC": "Yoshio Yamagata",
    "KEBD": "Hirotaka Chiba",
    "KEBE": "Tokumasa Kogo",
    "KEBF": "Shoichi Tezuka",
    "KEBG": "Shozo Kuga",
    "KEBH": "Ryosuke Hoya",
    "KEBI": "Mitsuyoshi Muta",
    "KEBJ": "Shingo Kanno",
    "KEBK": "Tadashi Uwajima",
    "KEBL": "Sakae Uzawa",
    # === Men in black / cutscene ===
    "KURA": "Man in black A",
    "KURB": "Man in black B",
    "JOE_": "Jo Higuchi",
    "JONZ": "Jones Henders",
    # === Animals ===
    "CATA": "Cat (white)",
    "CATB": "Cat (yellow)",
    "CATC": "Cat (black)",
    "CATM": "Kitten",
    "DOGA": "Dog (brown)",
    "DOGB": "Dog (white)",
    # === Remaining characters ===
    "TKNB": "Akihito Anzai",
    "HDEI": "Akiim Chant",
    "SATO": "Arihiro Sato",
    "EIKK": "Eiko Kusano",
    "TJMA": "Eri Tajima",
    "BSJM": "Katsutoshi Busujima",
    "KAYO": "Kayoko Ito",
    "KNJI": "Kenji Aoyama",
    "KENI": "Kenta Iwasaki",
    "SIMZ": "Kenta Shimizu",
    "MNWA": "Kazumi Minowa",
    "KOTA": "Kota Mitsui",
    "KTRO": "Kotaro Sumiya",
    "KKEN": "Kyosuke Nishida",
    "KYSN": "Kiyoshi Nishida",
    "CMAL": "Lu Tang Chen",
    "HINA": "Mai Sawano",
    "MIHO": "Miho Sagawa",
    "MIKI": "Miki Maeda",
    "MRUA": "Minoru Asada",
    "OKYS": "Minoru Okayasu",
    "MTUR": "Mitsuko Mitsura",
    "MTRI": "Mitsuru Iwata",
    "MTUK": "Mitsuru Kumeta",
    "MORN": "Mohamad Hassan",
    "NAMS": "Natsumi Sakuragi",
    "NORK": "Noriko Nakamura",
    "PAUR": "Paulo McCoy",
    "PEDR": "Pedro Warren",
    "RIKA": "Rika Sato",
    "RBRT": "Robert Wells",
    "RYKO": "Ryoko Hattori",
    "MAGO": "Ryoko Nishizawa",
    "TMRA": "Ryozo Yada",
    "SCKO": "Sachiko Okae",
    "TEYI": "Sadam Daei",
    "SAGA": "Naoki Shoji",
    "SNDO": "Rikiya Shindo",
    "SNGA": "Izumi Sunaga",
    "SNJY": "Shinji Yamatani",
    "BUSS": "Shinya Onoue",
    "SYKU": "Shoko Usui",
    "STSI": "Satoshi Nagata",
    "SMIK": "Sumio Kosuge",
    "AKTG": "Susumu Aketagawa",
    "TAEN": "Taeko Nomura",
    "TDSI": "Tadashi Hama",
    "MURA": "Tadashi Muraoka",
    "TAKI": "Manabu Takimoto",
    "TKHS": "Kaoru Takahashi",
    "TKSA": "Tsukasa Takagi",
    "BIKA": "Takashi Watanabe",
    "BIKB": "Takahiro Iwami",
    "MITI": "Takako Michii",
    "TMHN": "Tomohito Niizato",
    "TOMH": "Toshimichi Fukui",
    "TYMK": "Tsuyoshi Murakami",
    "YOPA": "Tsuyoshi Takashima",
    "HMRO": "Hidekazu Himuro",
    "EIIU": "Hidekazu Yukawa",
    "HIDE": "Hideki Tajima",
    "HROT": "Hiroko Tahashi",
    "HTSI": "Hitoshi Numakubo",
    "HTSK": "Hitoshi Kai",
    "IRIE": "Yukiko Irie",
    "JONO": "Kosaku Shirono",
    "KURT": "Masahiro Kurata",
    "MSTA": "Yuka Mashita",
    "MRSK": "Shingo Murasaki",
    "DJUN": "Taiki Nimura",
    "GRYU": "Tomoaki Tange",
    "HANA": "Yoshiharu Hanaoka",
    "HTNK": "Yoshihide Hatanaka",
    "ECHO": "Yong Zhu Yan",
    "NGSM": "Tetsuya Nagashima",
    "NMKI": "Hiroshi Ueda",
    "NSMR": "Yoshihito Nishii",
    "YSKT": "Yoshikazu Takahashi",
    "YSHY": "Yoshio Yamada",
    "YASU": "Yasuo Ito",
    "YAYI": "Yayoi Arisugawa",
    "YJIH": "Yuji Hirano",
    "YJJI": "Genzo Todaka",
    "YKDM": "Seiya Kumagai",
    "YMGC": "Yosuke Yamaguchi",
    "YMST": "Shinichi Yamashita",
    "YUMM": "Yumi Morino",
    "YURI": "Yuriko Kikuchi",
    "YUKK": "Yuka Komine",
    "YAMO": "Tatsuhito Yamaoka",
    "MYTY": "Takuya Maruyama",
    "TMNY": "Naomichi Tsukamoto",
    "FLDC": "Naomi Koshiba",
}


def transpile_scn3(json_path, output_path, verbose=False):
    with open(json_path, 'r') as f:
        data = json.load(f)

    disasm = data.get('disassembly', [])

    # ---- Build lookup tables ----
    strings = {}
    for s in data.get('strings', []):
        if ': ' in s:
            addr, val = s.split(': ', 1)
            strings[addr] = val

    sound_strings = {addr: val for addr, val in strings.items()
                     if '.snd' in val.lower()}
    model_by_idx = {i: MODEL_ALIASES.get(m['name'], m['name'])
                    for i, m in enumerate(data.get('models', []))}

    # ---- Parse instructions ----
    insts = []
    label_sources = set()
    label_targets = set()

    for entry in disasm:
        if ': ' not in entry:
            continue
        addr, rest = entry.split(': ', 1)
        mnemonic = rest.split(' ')[0]
        ops = [o.strip() for o in rest[len(mnemonic):].strip().split(',')
               if o.strip()]
        insts.append({'addr': addr, 'mnemonic': mnemonic, 'ops': ops})
        label_sources.add(addr)
        if mnemonic in ('JMP', 'JMPX', 'JZ') and ops:
            label_targets.add(ops[0])

    valid_labels = label_targets & label_sources

    # Count how many predecessors each label has (for stack reset decisions)
    # A label with 2+ predecessors is a merge point where stack state is ambiguous
    label_pred_count = {}
    for inst_entry in insts:
        m = inst_entry['mnemonic']
        o = inst_entry['ops']
        if m in ('JMP', 'JMPX', 'JZ') and o:
            target = o[0]
            label_pred_count[target] = label_pred_count.get(target, 0) + 1
    # Fall-through also counts as a predecessor for the next label
    for idx, inst_entry in enumerate(insts):
        if inst_entry['addr'] in valid_labels and idx > 0:
            prev_m = insts[idx-1]['mnemonic']
            # If previous instruction wasn't an unconditional jump, it falls through
            if prev_m not in ('JMP', 'JMPX'):
                label_pred_count[inst_entry['addr']] = label_pred_count.get(inst_entry['addr'], 0) + 1

    # ================================================================
    # SEMANTIC RESOLUTION
    # ================================================================
    def resolve_model(val):
        try:
            idx = int(val, 16) if val.startswith('0x') else int(val)
            return model_by_idx.get(idx, val)
        except:
            return val

    def hex_to_float(h):
        """Convert 10-char hex string to IEEE 754 float."""
        if not isinstance(h, str) or len(h) != 10 or not h.startswith('0x'):
            return None
        try:
            return struct.unpack('>f', bytes.fromhex(h[2:]))[0]
        except:
            return None

    def resolve_dlg_id(val_int, hex_str):
        """Detect 0xAA3DXXXX dialogue IDs and resolve to area + line."""
        h = hex_str[2:].upper() if hex_str.startswith('0x') else hex_str.upper()
        if len(h) < 6:
            return None
        # Pattern: byte[3]=area, byte[2]=0x3D, bytes[1:0]=line
        if (val_int & 0x00FF0000) == 0x003D0000 and val_int > 0xFFFF:
            area = (val_int >> 24) & 0xFF
            line = val_int & 0xFFFF
            area_name = AREA_NAMES.get(area, f"AREA_{hex(area)}")
            return f"DLG_{area_name}_{hex(line)}"
        # Also match 7-digit pattern like 0x123d101
        if '3D' in h and len(h) == 7:
            area = val_int >> 20
            line = val_int & 0xFFF
            area_name = AREA_NAMES.get(area, f"AREA_{hex(area)}")
            return f"DLG_{area_name}_{hex(line)}"
        return None

    def resolve_packed_verbs(val_int):
        """Detect packed verb pairs (0xD4xxD4xx, 0xE4xxE5xx patterns)."""
        hi = (val_int >> 16) & 0xFFFF
        lo = val_int & 0xFFFF
        hi_top = (hi >> 12) & 0xF
        lo_top = (lo >> 12) & 0xF
        # Entity operation pairs: 0xDx, 0xEx
        if hi_top in (0xD, 0xE) and lo_top in (0xD, 0xE):
            hi_name = SET7_VERBS.get(hex(hi), hex(hi))
            lo_name = SET7_VERBS.get(hex(lo), hex(lo))
            return f"PACKED({hi_name}, {lo_name})"
        return None

    def resolve_id(val_int):
        """Detect 4-byte character/object IDs using MAKE_ID logic."""
        # Try as ASCII tag
        try:
            tag = struct.pack('<I', val_int).decode('ascii')
            if all(32 <= ord(c) < 127 for c in tag):
                tag_stripped = tag.strip()
                # Use friendly name if known
                name = CHAR_ABBREVIATIONS.get(tag_stripped, tag_stripped)
                # Replace spaces/parens with underscores for valid identifiers
                name = name.replace(' ', '_').replace('(', '').replace(')', '')
                return f"ID_{name}"
        except:
            pass
        return None

    def unpack_val(v):
        """Master value resolver. Order: flags -> strings -> dlg -> packed -> float -> raw."""
        if not isinstance(v, str):
            return str(v)

        # Direct flag match
        if v in KNOWN_FLAGS:
            return KNOWN_FLAGS[v]

        # String table match
        if v in strings:
            sval = strings[v]
            # Annotate map IDs with location names
            # Check exact match first, then search within path strings
            sval_clean = sval.rstrip('\x00').strip()
            map_name = MAP_ID_NAMES.get(sval_clean, None)
            if not map_name:
                # Check if a known map ID appears as the last path component
                # e.g. 'scene/02/JOMO' -> check 'JOMO'
                for sep in ('/', '\\'):
                    if sep in sval_clean:
                        last_part = sval_clean.rsplit(sep, 1)[-1]
                        map_name = MAP_ID_NAMES.get(last_part, None)
                        if map_name:
                            break
            if map_name:
                return f'"{sval}"  /* {map_name} */'
            return f'"{sval}"'

        if not v.startswith('0x'):
            return v

        try:
            val_int = int(v, 16)
        except:
            return v

        # Small integers (0-255) stay numeric
        if val_int <= 0xFF and len(v) <= 4:
            return str(val_int)

        # Character/Object ID detection (MAKE_ID)
        char_id = resolve_id(val_int)
        if char_id:
            return char_id

        # Dialogue ID detection (0xAA3DXXXX)
        dlg = resolve_dlg_id(val_int, v)
        if dlg:
            return dlg

        # Packed verb detection (0xDxxxExxx)
        if val_int > 0xFFFF:
            packed = resolve_packed_verbs(val_int)
            if packed:
                return packed

        # Float recovery for 32-bit values
        val_f = hex_to_float(v)
        if val_f is not None and 0.001 < abs(val_f) < 100000:
            return f"{val_f:.3f}f"

        return v

    def get_sound_comment(args):
        """Detect sound file references and annotate with speaker."""
        for a in args:
            if a in sound_strings:
                snd_name = sound_strings[a]
                # Try to identify the speaker
                base = snd_name.lower().replace('.snd', '')
                speaker = ""
                for prefix, name in VOICE_SPEAKERS.items():
                    if base.startswith(prefix):
                        speaker = f" [{name}]"
                        break
                return f"  # 🔊 {snd_name}{speaker}"
        return ""

    def format_args(args):
        return ", ".join([unpack_val(a) for a in args])

    # ================================================================
    # CODE GENERATION
    # ================================================================
    lines = [
        "'''",
        "SCN3 DECOMPILED SCRIPT",
        "=========================================================",
        "Recovered from Dreamcast MAPINFO.BIN  |  Phase 7: Readability",
        "",
        "Data sources:",
        "  - Leaked SEQCONV.C / 0154_1.C (Dreamcast source code)",
        "  - Wulinshu SCN3 documentation (shenmuescripts.md)",
        "  - HLib task queue system (taskqueuesystem.md)",
        "  - GhidraSCN3 processor module (SCN3.slaspec)",
        "  - Shenmue Modding Knowledgebase (Shenmue-Mods/Knowledgebase):",
        "    - 242 SM1 character IDs (Characters_Names_IDs_Models.md)",
        "    - 150+ map IDs (Map_Names_IDs.md)",
        "  - DC Patch Code Guide (SSJ2 Dark) — inventory/move/flag addresses",
        "'''",
        "from scn3_runtime import *",
        "",
        "ctx = SCN3Context()",
        "global_flags = {}  # FLAG_STORY_PROGRESS, FLAG_TIME_OF_DAY, etc.",
        "local_vars = {}",
        "",
    ]

    stack = []
    mobj_name = "None"
    r14_expr = None
    # Track which OP_xx codes consume/produce stack values.
    # Supports both old names (OP_01) and new slaspec names (COMMIT).
    OP_STACK_EFFECT = {
        'OP_01': 0, 'COMMIT': 0,          # commit/finalize
        'OP_02': 1, 'FRAME_RD': 1,        # read from MOBJ frame — pushes 1
        'OP_03': 0, 'ARG_SEP': 0,         # argument separator
        'OP_04': 0, 'FRAME_SETUP': 0,     # call frame setup
        'OP_05': 0,                        # nop-like
        'OP_06': 1, 'FRAME_RD2': 1,       # read operation — pushes 1
        'OP_07': 1, 'FRAME_RD3': 1,       # read operation — pushes 1
        'OP_08': 0, 'CALL_SETUP': 0,      # call frame setup
        'OP_09': 0, 'CLEANUP': 0,         # cleanup paired with COMMIT
        'OP_0A': 0,                        # nop-like
        'OP_0B': -1, 'DISCARD': -1,       # pop and discard one value
        'OP_0C': -1, 'TEST': -1,          # pop to R14 (test/compare)
        'OP_0D': 0,
        'OP_0E': 0,
        'OP_0F': 0,
    }

    def emit(text, addr, comment=""):
        if verbose:
            lines.append(f"    {text}  # {addr}{comment}")
        elif comment:
            lines.append(f"    {text}{comment}")
        else:
            lines.append(f"    {text}")

    def safe_pop():
        return stack.pop() if stack else "0"

    MAX_STACK_DEPTH = 16  # Max args any SCN3 function takes

    def reset_stack():
        """Clear the stack at basic block boundaries to prevent corruption."""
        stack.clear()

    def cap_stack():
        """Trim stack to max depth to prevent unbounded accumulation."""
        while len(stack) > MAX_STACK_DEPTH:
            stack.pop(0)  # Remove oldest (bottom) values

    for i, inst in enumerate(insts):
        addr = inst['addr']
        op = inst['mnemonic']
        ops = inst['ops']

        # ---- Labels = basic block entry ----
        if addr in valid_labels:
            # Cap the stack depth instead of clearing it.
            # This prevents unbounded accumulation while preserving
            # valid arguments that flow across basic blocks.
            cap_stack()
            lines.append(f"\ndef label_{addr[2:]}():")

        # ---- Stack operations ----
        if op.startswith('PUSH_'):
            stack.append(ops[0] if ops else "0")
            continue

        elif op in ('MOV_REG', 'STK_TO_R14', 'TEST'):
            r14_expr = unpack_val(safe_pop())
            continue

        elif op == 'DISCARD':
            safe_pop()
            continue

        elif op == 'R14_TO_STK':
            stack.append(r14_expr if r14_expr else "ctx.r14")

        # ---- MOBJ operations ----
        elif op == 'MOBJ_SEL':
            mobj_name = resolve_model(ops[0] if ops else "0")
            emit(f'ctx.select("{mobj_name}")', addr)

        elif op == 'MOBJ_REF':
            stack.append(f'ref("{resolve_model(ops[0] if ops else "0")}")')

        elif op == 'MOBJ_OP':
            stack.append(f"mobj_op({unpack_val(ops[0] if ops else '0')})")

        elif op == 'MOBJ_RD32':
            # Annotate with known memory offset if MOBJ_OP preceded this
            stack.append("ctx.mobj.read32()")
        elif op == 'MOBJ_RD16':
            stack.append("ctx.mobj.read16()")
        elif op == 'MOBJ_RD8':
            stack.append("ctx.mobj.read8()")

        elif op == 'MOBJ_WR32':
            val = unpack_val(safe_pop())
            # Check if previous MOBJ_OP offset is a known memory address
            mem_comment = ""
            if stack and stack[-1].startswith("mobj_op("):
                try:
                    off_str = stack[-1][8:-1]  # extract offset from mobj_op(X)
                    off_int = int(off_str, 16) if off_str.startswith("0x") else int(off_str)
                    if off_int in KNOWN_MEMORY_OFFSETS:
                        mem_comment = f"  # -> {KNOWN_MEMORY_OFFSETS[off_int]}"
                except (ValueError, IndexError):
                    pass
            emit(f"ctx.mobj.write32({val})", addr, mem_comment)
        elif op == 'MOBJ_WR16':
            emit(f"ctx.mobj.write16({unpack_val(safe_pop())})", addr)
        elif op == 'MOBJ_WR8':
            emit(f"ctx.mobj.write8({unpack_val(safe_pop())})", addr)

        # ---- Control flow ----
        elif op == 'JZ':
            target = ops[0] if ops else "???"
            expr = r14_expr if r14_expr else "ctx.r14"
            emit(f"if not ({expr}): goto label_{target[2:]}", addr)
            r14_expr = None
            # JZ = conditional branch: fall-through keeps the stack intact
            # (the stack is only reset when we hit a label, where paths merge)

        elif op in ('JMP', 'JMPX'):
            target = ops[0] if ops else "???"
            emit(f"goto label_{target[2:]}", addr)
            # After unconditional jump, next instruction is unreachable
            # unless it's a label (which will reset the stack itself)
            reset_stack()

        # ---- Function calls (the core mapping) ----
        elif op.startswith('CALL_SET'):
            set_num = op[-1]
            func_id_raw = ops[0] if ops else "0"
            # Normalize hex: strip leading zeros so '0x0385' -> '0x385'
            # This ensures Ghidra's output format matches our dict keys
            if func_id_raw.startswith('0x'):
                func_id = '0x' + func_id_raw[2:].lstrip('0') if func_id_raw[2:].lstrip('0') else '0x0'
            else:
                func_id = func_id_raw
            args = []
            while stack:
                args.append(stack.pop())
            args.reverse()
            arg_str = format_args(args)
            snd_comment = get_sound_comment(args)

            def lookup_verb(verb_dict, fid, fallback_prefix):
                """Try exact match, then with leading zero variants."""
                if fid in verb_dict:
                    return verb_dict[fid]
                # Try zero-padded variants for short hex values
                if fid.startswith('0x') and len(fid) <= 5:
                    padded = '0x' + fid[2:].zfill(4)
                    if padded in verb_dict:
                        return verb_dict[padded]
                return f"{fallback_prefix}_{fid}"

            if set_num == '7':
                verb = lookup_verb(SET7_VERBS, func_id, "set7")
                emit(f"{verb}({arg_str})", addr, snd_comment)
            elif set_num == '6':
                verb = lookup_verb(SET6_VERBS, func_id, "set6")
                emit(f"{verb}({arg_str})", addr, snd_comment)
            elif set_num == '3':
                verb = lookup_verb(SET3_VERBS, func_id, "set3")
                emit(f"{verb}({arg_str})", addr, snd_comment)
            elif set_num == '4':
                verb = lookup_verb(SET4_VERBS, func_id, "set4")
                emit(f"{verb}({arg_str})", addr, snd_comment)
            elif op == 'CALL_SET1':
                emit(f"voice({unpack_val(func_id)}, [{arg_str}])", addr, snd_comment)
            elif op == 'CALL_SET2':
                # Set 2 = memory functions (memset, memcpy, strcpy) + extended
                mem_verbs = {
                    "0x0": "mem_deleted", "0x1": "memset",
                    "0x2": "memcpy", "0x3": "strcpy", "0x4": "mem_read",
                    "0x5": "mem_write", "0x6": "mem_alloc", "0x7": "mem_free",
                    "0xd1": "mem_move_data", "0xd4": "mem_pos_data",
                    "0xd5": "mem_rot_data", "0xd7": "mem_vis_data",
                    "0xe4": "mem_entity_data",
                    "0x8ad5": "mem_load_model",
                    "0x52d5": "mem_rot_block",
                    "0xecd4": "mem_cutscene_data",
                    "0xb20000": "mem_area_data",
                    "0x1000000": "mem_scene_data",
                    "0xa000000": "mem_bulk_data",
                }
                verb = lookup_verb(mem_verbs, func_id, "set2")
                emit(f"{verb}({arg_str})", addr)
            else:
                emit(f"sys_call(set={set_num}, fn={func_id}, [{arg_str}])", addr, snd_comment)

        # ---- Global/Local variable access ----
        elif op == 'ST_GLOBAL':
            val = unpack_val(safe_pop())
            dest = unpack_val(safe_pop())
            # Annotate with DC game state name if known
            dc_comment = ""
            try:
                dest_int = int(dest, 16) if dest.startswith('0x') else int(dest)
                if dest_int in DC_GAME_STATE:
                    dc_comment = f"  # -> {DC_GAME_STATE[dest_int]}"
            except (ValueError, TypeError):
                pass
            emit(f"global_flags[{dest}] = {val}", addr, dc_comment)

        elif op == 'LD_GLOBAL':
            src = unpack_val(safe_pop())
            # Use DC game state name in expression if known
            dc_name = None
            try:
                src_int = int(src, 16) if src.startswith('0x') else int(src)
                dc_name = DC_GAME_STATE.get(src_int)
            except (ValueError, TypeError):
                pass
            if dc_name:
                stack.append(f"global_flags[{src}]  /* {dc_name} */")
            else:
                stack.append(f"global_flags[{src}]")

        elif op == 'ST_LOCAL':
            val = unpack_val(safe_pop())
            dest = unpack_val(safe_pop())
            emit(f"local_vars[{dest}] = {val}", addr)

        elif op == 'LD_LOCAL':
            src = unpack_val(safe_pop())
            stack.append(f"local_vars[{src}]")

        # ---- Integer comparison ----
        elif op == 'EQ':
            b, a = unpack_val(safe_pop()), unpack_val(safe_pop())
            stack.append(f"({a} == {b})")
        elif op == 'NE':
            b, a = unpack_val(safe_pop()), unpack_val(safe_pop())
            stack.append(f"({a} != {b})")
        elif op == 'GT':
            b, a = unpack_val(safe_pop()), unpack_val(safe_pop())
            stack.append(f"({a} > {b})")
        elif op == 'GE':
            b, a = unpack_val(safe_pop()), unpack_val(safe_pop())
            stack.append(f"({a} >= {b})")
        elif op == 'LT':
            b, a = unpack_val(safe_pop()), unpack_val(safe_pop())
            stack.append(f"({a} < {b})")
        elif op == 'LE':
            b, a = unpack_val(safe_pop()), unpack_val(safe_pop())
            stack.append(f"({a} <= {b})")

        # ---- Integer arithmetic ----
        elif op == 'OP_ADD':
            b, a = unpack_val(safe_pop()), unpack_val(safe_pop())
            stack.append(f"({a} + {b})")
        elif op == 'OP_SUB':
            b, a = unpack_val(safe_pop()), unpack_val(safe_pop())
            stack.append(f"({a} - {b})")
        elif op == 'OP_MUL':
            b, a = unpack_val(safe_pop()), unpack_val(safe_pop())
            stack.append(f"({a} * {b})")
        elif op == 'OP_DIV':
            b, a = unpack_val(safe_pop()), unpack_val(safe_pop())
            stack.append(f"({a} // {b})")

        # ---- Float comparison ----
        elif op == 'F_LE':
            b, a = unpack_val(safe_pop()), unpack_val(safe_pop())
            stack.append(f"({a} <=f {b})")
        elif op == 'F_LT':
            b, a = unpack_val(safe_pop()), unpack_val(safe_pop())
            stack.append(f"({a} <f {b})")
        elif op == 'F_GE':
            b, a = unpack_val(safe_pop()), unpack_val(safe_pop())
            stack.append(f"({a} >=f {b})")
        elif op == 'F_GT':
            b, a = unpack_val(safe_pop()), unpack_val(safe_pop())
            stack.append(f"({a} >f {b})")

        # ---- Float arithmetic ----
        elif op == 'F_ADD':
            b, a = unpack_val(safe_pop()), unpack_val(safe_pop())
            stack.append(f"({a} +f {b})")
        elif op == 'F_SUB':
            b, a = unpack_val(safe_pop()), unpack_val(safe_pop())
            stack.append(f"({a} -f {b})")
        elif op == 'F_MUL':
            b, a = unpack_val(safe_pop()), unpack_val(safe_pop())
            stack.append(f"({a} *f {b})")
        elif op == 'F_DIV':
            b, a = unpack_val(safe_pop()), unpack_val(safe_pop())
            stack.append(f"({a} /f {b})")

        # ---- Type casting ----
        elif op == 'F_CAST':
            stack.append(f"float({unpack_val(safe_pop())})")
        elif op == 'I_CAST':
            stack.append(f"int({unpack_val(safe_pop())})")

        # ---- Bitwise NOT ----
        elif op == 'NOT':
            stack.append(f"(~{unpack_val(safe_pop())})")

        # ---- Compound assignment operators ----
        # These operate on MOBJ cycle pointer: mobj[ptr] OP= stack_top
        elif op == 'AND_EQ':
            emit(f"ctx.mobj &= {unpack_val(safe_pop())}", addr)
        elif op == 'OR_EQ':
            emit(f"ctx.mobj |= {unpack_val(safe_pop())}", addr)
        elif op == 'XOR_EQ':
            emit(f"ctx.mobj ^= {unpack_val(safe_pop())}", addr)
        elif op == 'ADD_EQ':
            emit(f"ctx.mobj += {unpack_val(safe_pop())}", addr)
        elif op == 'SUB_EQ':
            emit(f"ctx.mobj -= {unpack_val(safe_pop())}", addr)
        elif op == 'MUL_EQ':
            emit(f"ctx.mobj *= {unpack_val(safe_pop())}", addr)
        elif op == 'DIV_EQ':
            emit(f"ctx.mobj //= {unpack_val(safe_pop())}", addr)
        elif op == 'MOD_EQ':
            emit(f"ctx.mobj %= {unpack_val(safe_pop())}", addr)
        elif op == 'SHL_EQ':
            emit(f"ctx.mobj <<= {unpack_val(safe_pop())}", addr)
        elif op == 'SHR_EQ':
            emit(f"ctx.mobj >>= {unpack_val(safe_pop())}", addr)

        # ---- Stack pointer manipulation ----
        elif op == 'SP_ADD':
            # SP_ADD adjusts the frame pointer for local variable space.
            # It does NOT clear the argument stack — pushed values remain live.
            # Don't emit sp_adjust noise — it's a VM implementation detail.
            continue

        # ---- Named arithmetic ops (from updated slaspec) ----
        elif op == 'OP_ADD':
            b, a = unpack_val(safe_pop()), unpack_val(safe_pop())
            stack.append(f"({a} + {b})")
        elif op == 'OP_SUB':
            b, a = unpack_val(safe_pop()), unpack_val(safe_pop())
            stack.append(f"({a} - {b})")
        elif op == 'OP_MUL':
            b, a = unpack_val(safe_pop()), unpack_val(safe_pop())
            stack.append(f"({a} * {b})")
        elif op == 'OP_DIV':
            b, a = unpack_val(safe_pop()), unpack_val(safe_pop())
            stack.append(f"({a} // {b})")
        elif op == 'OP_MOD':
            b, a = unpack_val(safe_pop()), unpack_val(safe_pop())
            stack.append(f"({a} % {b})")
        elif op == 'OP_AND':
            b, a = unpack_val(safe_pop()), unpack_val(safe_pop())
            stack.append(f"({a} & {b})")
        elif op == 'OP_OR':
            b, a = unpack_val(safe_pop()), unpack_val(safe_pop())
            stack.append(f"({a} | {b})")
        elif op == 'OP_XOR':
            b, a = unpack_val(safe_pop()), unpack_val(safe_pop())
            stack.append(f"({a} ^ {b})")
        elif op == 'OP_SHL':
            b, a = unpack_val(safe_pop()), unpack_val(safe_pop())
            stack.append(f"({a} << {b})")
        elif op == 'OP_SHR':
            b, a = unpack_val(safe_pop()), unpack_val(safe_pop())
            stack.append(f"({a} >> {b})")
        elif op == 'OP_NEG':
            stack.append(f"(-{unpack_val(safe_pop())})")
        elif op in ('OP_LAND', 'OP_LOR'):
            b, a = unpack_val(safe_pop()), unpack_val(safe_pop())
            op_sym = "and" if op == 'OP_LAND' else "or"
            stack.append(f"({a} {op_sym} {b})")
        elif op == 'OP_LNOT':
            stack.append(f"(not {unpack_val(safe_pop())})")

        # ---- New slaspec frame/control mnemonics ----
        elif op in ('COMMIT', 'CLEANUP', 'CALL_SETUP', 'ARG_SEP', 'FRAME_SETUP'):
            continue
        elif op in ('FRAME_RD', 'FRAME_RD2', 'FRAME_RD3'):
            stack.append("ctx.mobj.read32()")

        # ---- Unknown OP_xx opcodes ----
        elif op.startswith('OP_'):
            effect = OP_STACK_EFFECT.get(op, None)
            if effect is not None:
                if effect < 0:
                    for _ in range(-effect):
                        safe_pop()
                elif effect > 0:
                    val = ops[0] if ops else "0"
                    for _ in range(effect):
                        stack.append(val)
            continue

        # ---- Suppress noise ----
        elif op == 'NOP':
            continue

        # ---- Unknown instruction fallback ----
        elif op.startswith('OP_UNK'):
            if ops:
                stack.append(ops[0])
            continue

    # ================================================================
    # POST-PROCESSING: Readability improvements
    # ================================================================

    # Step 1: Build semantic label names from context (before any removal)
    label_defs_pre = {}  # line_index -> label_name
    for idx, line in enumerate(lines):
        m = re.match(r'\s*def (label_\w+)\(\):', line)
        if m:
            label_defs_pre[idx] = m.group(1)

    label_names = {}
    label_counters = {}
    for idx, label in label_defs_pre.items():
        semantic = None
        for j in range(idx + 1, min(idx + 6, len(lines))):
            line = lines[j].strip()
            if not line or line.startswith('#') or line.startswith('def '):
                continue
            fm = re.match(r'(entity_setup|entity_set_anim|entity_set_attrs|'
                          r'scnf_camera|scnf_camera_cut|scnf_camera_lerp|'
                          r'load_resource|load_model|pos_set_xyz|pos_set_world|'
                          r'task_yield|trigger_callback|anim_play_ext|'
                          r'ctx\.select|ctx\.mobj|global_flags|local_vars|'
                          r'if not)', line)
            if fm:
                tag = fm.group(1).replace('.', '_').replace(' ', '_')
                label_counters[tag] = label_counters.get(tag, 0) + 1
                semantic = f"{tag}_{label_counters[tag]:03d}"
                break
            fm2 = re.match(r'(\w+)\(', line)
            if fm2 and not line.startswith('goto '):
                tag = fm2.group(1)
                if len(tag) > 3 and not tag.startswith('0x'):
                    label_counters[tag] = label_counters.get(tag, 0) + 1
                    semantic = f"{tag}_{label_counters[tag]:03d}"
                    break
            break
        if semantic:
            label_names[label] = f"block_{semantic}"

    # Step 2: Apply renaming in-place first
    for i, line in enumerate(lines):
        for old_label, new_label in label_names.items():
            if old_label in line:
                lines[i] = lines[i].replace(old_label, new_label)

    # Step 3: Now collect goto targets and label defs on the RENAMED lines
    goto_targets = set()
    label_defs = {}  # line_index -> label_name
    for idx, line in enumerate(lines):
        for m in re.finditer(r'goto (\w+)', line):
            goto_targets.add(m.group(1))
        m = re.match(r'\s*def (\w+)\(\):', line)
        if m:
            label_defs[idx] = m.group(1)

    # Step 4: Remove unreferenced labels and trivial gotos
    cleaned = []
    i = 0
    removed_labels = 0
    removed_gotos = 0
    while i < len(lines):
        line = lines[i]

        # Remove unreferenced label definitions
        m = re.match(r'\s*def (\w+)\(\):', line)
        if m:
            label = m.group(1)
            if label not in goto_targets:
                if cleaned and cleaned[-1] == '':
                    cleaned.pop()
                i += 1
                removed_labels += 1
                continue

        # Remove trivial gotos (goto X immediately before def X)
        gm = re.search(r'goto (\w+)', line)
        if gm:
            next_idx = i + 1
            while next_idx < len(lines) and lines[next_idx].strip() == '':
                next_idx += 1
            if next_idx < len(lines):
                nm = re.match(r'\s*def (\w+)\(\):', lines[next_idx])
                if nm and gm.group(1) == nm.group(1):
                    i += 1
                    removed_gotos += 1
                    continue

        cleaned.append(line)
        i += 1

    # Step 5: Remove consecutive blank lines (max 2)
    final = []
    blank_count = 0
    for line in cleaned:
        if line.strip() == '':
            blank_count += 1
            if blank_count <= 2:
                final.append(line)
        else:
            blank_count = 0
            final.append(line)

    # Step 6 (deferred): control-flow structuring (goto -> if/while)
    # Keep output stable for now; perform only safe readability cleanup.
    lines = final
    renamed_labels = len(label_names)

    with open(output_path, 'w') as f:
        f.write('\n'.join(lines))

    phase = "Phase 7"
    print(f"[{phase}] Decompiled {len(insts)} instructions -> {len(lines)} lines -> {output_path}")
    if not verbose:
        print(
            f"  Readability: {removed_labels} dead labels removed, "
            f"{removed_gotos} trivial gotos removed, {renamed_labels} labels renamed"
        )


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python scn3_to_python.py <input.json> <output.py> [--verbose]")
    else:
        verbose = '--verbose' in sys.argv
        transpile_scn3(sys.argv[1], sys.argv[2], verbose=verbose)

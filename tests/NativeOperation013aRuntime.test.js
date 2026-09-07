import assert from "node:assert/strict";
import test from "node:test";
import { createNativeEventOperationExecutor, createNativeOperation013aSemanticHandlers } from "../play/events/NativeEventOperationRuntime.js";

test("operation 0x013a writes the exact direct-vector third component", async () => {
  let detail;
  const execute=createNativeEventOperationExecutor({handlers:createNativeOperation013aSemanticHandlers({writeNativeObjectVectorComponent:value=>{detail=value;return{previous:1,value:value.value,vector:[1,2,value.value]};}})});
  const result=await execute({semanticId:"resolved-object-float-word-48-write",arguments:[{kind:"constant",value:0,ascii:"LIG7"},{kind:"constant",value:0x3f800000}]});
  assert.deepEqual(detail,{objectTag:"LIG7",componentIndex:2,value:0x3f800000});
  assert.equal(result.status,"continued");
});

test("operation 0x013a preserves the missing-object native no-op", async () => {
  const execute=createNativeEventOperationExecutor({handlers:createNativeOperation013aSemanticHandlers({writeNativeObjectVectorComponent:()=>undefined})});
  const result=await execute({semanticId:"resolved-object-float-word-48-write",arguments:[{kind:"constant",value:0,ascii:"NONE"},{kind:"constant",value:0}]});
  assert.equal(result.mutation.nativeNoOp,true);
});


=Task memory structure=
{| class="wikitable"
|-

| ! Position !! Length !! Type !! Description |
| ------------------------------------------- |
| 0x00                                        |
| -                                           |
| 0x08                                        |
| -                                           |
| 0x0C                                        |
| -                                           |
| 0x0D                                        |
| -                                           |
| 0x10                                        |
| -                                           |
| 0x18                                        |
| -                                           |
| 0x20                                        |
| -                                           |
| 0x28                                        |
| -                                           |
| 0x30                                        |
| -                                           |
| 0x38                                        |
| -                                           |
| 0x40                                        |
| -                                           |
| 0x48                                        |
| -                                           |
| 0x50                                        |
| -                                           |
| 0x58                                        |
| -                                           |
| 0x60                                        |
| -                                           |
| 0x68                                        |
| }                                           |

=Task queue=
Task Queue Pointer Offset: 0x1481FFA50 (v1.07)`<br>`
At the start an ROOT task is created.`<br>`
When the ROOT task was created the Queue gets filled with NONE task's which do nothing.`<br>`
At initialization each task has the next task in order as their next task specified inside 0x18.`<br>`
The last task however points to 0x142A88530 (v1.07) as their next task.`<br>`
The ROOT task points to the first task as it's next task.`<br>`

=Enqueue task=

==Enqueue task without TASK data allocation==
To enqueue an task without TASK data allocation the subroutine 0x14049D890 (v1.07) needs to be called.
`<sub>`
  EnqueueTask(void* callbackFunction, uint8_t nextFunctionIndex, uint8_t a3, uint32_t taskToken)
`</sub>`

==Enqueue task with TASK data allocation==
To enqueue an task with TASK data allocation the subroutine 0x14049DA10 (v1.07) needs to be called.`<br>`
`<sub>`
  EnqueueTaskWithData(void* callbackFunction, uint8_t nextFunctionIndex, uint8_t a3, uint32_t dataSize, uint32_t taskToken, char* debugTaskName)
`</sub>`

=Task creation=
During the enqueue process the task will be created with the given callback function.`<br>`
The callback function parameter, which is optional, is an pointer to an struct than can have any shape or size the callback function needs.`<br>`
This parameter struct will be allocated inside the USE/fREe storage.

=Task execution=
The main loop iterates through the task queue and calls the callback function with the optional parameter.`<br>`
When the callback function returns the next task pointer is read from the current task and moved into the task queue address pointer.

<syntaxhighlight lang="C++" line>
void Shenmue::Main(int argc, void *argv) {
  // initialize
  if ( Shenmue::Initialization(argc, argv) )
  {
    HLib_Task * taskPtr = nullptr;

    // loop all tasks
    for ( taskPtr = HLib::CurrentTask; ; HLib::CurrentTask = taskPtr )
    {
      // execute task function
      taskPtr->taskCallbackFnPtr(taskPtr->task_data);

    // select next task
      taskPtr = HLib::CurrentTask->next_task;
    }
  }
}`</syntaxhighlight>`

=Task cleanup (Destruction)=
A task controls how long it lives in its own callback function.`<br>`
When a task wants to be destroyed it calls the subroutine 0x14049D660 (v1.07) during its own callback.`<br>`

Tasks can also be destroyed if a pointer can be retrieved for it, like this:

<syntaxhighlight lang="C++" line>
  HLib_Task * TASK = HLib::EnqueueTaskWithoutParameter(HLTaskFunc_CharacterHandler_Callback, a1, 4ui64, 'RAHC');
  if ( !TASK )
    goto COULD_NOT_ENQUEUE_TASK;
  if ( TASK->task_data )
    goto TASK_DATA_ALREADY_EXISTS;

  task_memory = HLib::AllocHeapMemBlock(272i64, 'KSAT');
  if ( task_memory )
    *((int *)task_memory + 0x7) |= 0x10u;

  TASK->task_data = task_memory;
  if ( !task_memory )
  {
TASK_DATA_ALREADY_EXISTS:
    TASK->initTaskFnPtr = 0i64;
    TASK->taskCallbackFnPtr = HLib::DestroyCurrentTask;
    TASK->taskPtr08 = 0i64;
COULD_NOT_ENQUEUE_TASK:
    TASK = 0i64;
  }
`</syntaxhighlight>`

=Task parameter=
When a task gets enqueued with a parameter it will need to find some "fREe" storage in the USE/fREe storage.`<br>`

==Storage entry==
{| class="wikitable"
|-

| ! Position !! Length !! Type !! Description |
| ------------------------------------------- |
| 0x00                                        |
| -                                           |
| 0x10                                        |
| -                                           |
| 0x18                                        |
| -                                           |
| 0x20                                        |
| -                                           |
| 0x40                                        |
| }                                           |

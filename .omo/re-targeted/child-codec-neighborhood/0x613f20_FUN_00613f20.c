
int FUN_00613f20(int *param_1,byte *param_2)

{
  return (*(int *)(param_1[1] + (uint)param_2[2] * 4) + *(int *)(*param_1 + (uint)param_2[3] * 4) ^
         *(uint *)(param_1[2] + (uint)param_2[1] * 4)) + *(int *)(param_1[3] + (uint)*param_2 * 4);
}


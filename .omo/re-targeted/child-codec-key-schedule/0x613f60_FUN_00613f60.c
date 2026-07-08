
void FUN_00613f60(int param_1,int *param_2,uint *param_3,byte *param_4,int param_5)

{
  *param_3 = *param_3 ^
             (*(int *)(param_2[1] + (uint)param_4[2] * 4) +
              *(int *)(*param_2 + (uint)param_4[3] * 4) ^
             *(uint *)(param_2[2] + (uint)param_4[1] * 4)) +
             *(int *)(param_2[3] + (uint)*param_4 * 4) ^ *(uint *)(param_1 + param_5 * 4);
  return;
}


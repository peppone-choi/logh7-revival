
undefined4 FUN_00614be0(int *param_1,undefined4 *param_2,uint param_3)

{
  uint uVar1;
  uint uVar2;
  undefined4 *puVar3;
  
  uVar2 = param_3 & 0xffff;
  if ((int)(uint)*(ushort *)(param_1 + 2) < (int)((uVar2 - *param_1) + param_1[1])) {
    return 0;
  }
  puVar3 = (undefined4 *)param_1[1];
  for (uVar1 = uVar2 >> 2; uVar1 != 0; uVar1 = uVar1 - 1) {
    *puVar3 = *param_2;
    param_2 = param_2 + 1;
    puVar3 = puVar3 + 1;
  }
  for (param_3 = param_3 & 3; param_3 != 0; param_3 = param_3 - 1) {
    *(undefined1 *)puVar3 = *(undefined1 *)param_2;
    param_2 = (undefined4 *)((int)param_2 + 1);
    puVar3 = (undefined4 *)((int)puVar3 + 1);
  }
  param_1[1] = param_1[1] + uVar2;
  return 1;
}


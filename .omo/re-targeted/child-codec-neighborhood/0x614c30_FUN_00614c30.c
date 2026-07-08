
uint FUN_00614c30(int *param_1,u_short param_2)

{
  int iVar1;
  u_short uVar2;
  uint uVar3;
  
  uVar3 = (param_1[1] - *param_1) + 2;
  if ((int)(uint)*(ushort *)(param_1 + 2) < (int)uVar3) {
    return uVar3 & 0xffffff00;
  }
  uVar2 = htons(param_2);
  *(u_short *)param_1[1] = uVar2;
  iVar1 = param_1[1];
  param_1[1] = iVar1 + 2;
  return CONCAT31((int3)((uint)(iVar1 + 2) >> 8),1);
}


// EXACT  0x004b5600  FUN_004b5600  undefined FUN_004b5600()

void FUN_004b5600(undefined4 *param_1,undefined1 param_2)

{
  uint uVar1;
  int iVar2;
  uint uVar3;
  undefined4 *puVar4;
  undefined4 local_8c [2];
  undefined1 local_84;
  undefined1 local_83;
  undefined4 local_82 [32];
  
  puVar4 = local_8c;
  for (iVar2 = 0x23; iVar2 != 0; iVar2 = iVar2 + -1) {
    *puVar4 = 0;
    puVar4 = puVar4 + 1;
  }
  local_8c[1] = FUN_004b4a90();
  local_84 = param_2;
  uVar1 = FUN_005ff2c9(param_1);
  if (0x41 < (int)uVar1) {
    FUN_005923a0(&DAT_0076e708,0);
  }
  local_83 = (undefined1)uVar1;
  puVar4 = local_82;
  for (uVar3 = (uVar1 & 0x7fffffff) >> 1; uVar3 != 0; uVar3 = uVar3 - 1) {
    *puVar4 = *param_1;
    param_1 = param_1 + 1;
    puVar4 = puVar4 + 1;
  }
  for (uVar3 = uVar1 * 2 & 3; uVar3 != 0; uVar3 = uVar3 - 1) {
    *(undefined1 *)puVar4 = *(undefined1 *)param_1;
    param_1 = (undefined4 *)((int)param_1 + 1);
    puVar4 = (undefined4 *)((int)puVar4 + 1);
  }
  *(undefined2 *)((int)local_82 + uVar1 * 2) = 0;
  FUN_004b78a0(0,0x79,local_8c);
  return;
}



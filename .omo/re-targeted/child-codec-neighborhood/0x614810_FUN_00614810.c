
uint __thiscall FUN_00614810(int param_1,undefined4 *param_2,uint param_3)

{
  undefined4 *puVar1;
  int iVar2;
  uint uVar3;
  byte *pbVar4;
  uint uVar5;
  
  if (*(int *)(param_1 + 4) != 0) {
    FUN_00648d6b(*(int *)(param_1 + 4));
  }
  uVar5 = param_3 & 0xffff;
  puVar1 = (undefined4 *)FUN_00648d42(uVar5);
  *(undefined4 **)(param_1 + 4) = puVar1;
  if (puVar1 == (undefined4 *)0x0) {
    uVar5 = FUN_00402290(&DAT_03350ce0,s__mtCipherModule__set_key__out_of_007b7cb4);
    return uVar5 & 0xffffff00;
  }
  for (uVar3 = uVar5 >> 2; uVar3 != 0; uVar3 = uVar3 - 1) {
    *puVar1 = *param_2;
    param_2 = param_2 + 1;
    puVar1 = puVar1 + 1;
  }
  iVar2 = 0;
  for (uVar3 = param_3 & 3; uVar3 != 0; uVar3 = uVar3 - 1) {
    *(undefined1 *)puVar1 = *(undefined1 *)param_2;
    param_2 = (undefined4 *)((int)param_2 + 1);
    puVar1 = (undefined4 *)((int)puVar1 + 1);
  }
  if (uVar5 != 0) {
    do {
      pbVar4 = (byte *)(*(int *)(param_1 + 4) + iVar2);
      iVar2 = iVar2 + 1;
      *pbVar4 = *pbVar4 ^ 0x17;
    } while (iVar2 < (int)uVar5);
  }
  *(undefined2 *)(param_1 + 8) = (undefined2)param_3;
  return CONCAT31((int3)((uint)iVar2 >> 8),1);
}


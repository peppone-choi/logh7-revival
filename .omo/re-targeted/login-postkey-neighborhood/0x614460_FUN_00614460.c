
undefined4 __thiscall
FUN_00614460(int param_1,undefined4 *param_2,uint param_3,int *param_4,uint *param_5)

{
  uint *puVar1;
  undefined4 uVar2;
  int *piVar3;
  int iVar4;
  uint uVar5;
  uint uVar6;
  uint uVar7;
  uint *puVar8;
  undefined4 *puVar9;
  
  piVar3 = param_4;
  if ((param_3 & 7) != 0) {
    return 0;
  }
  if (*param_4 == 0) {
    iVar4 = FUN_00648d42(param_3);
    *piVar3 = iVar4;
    if (iVar4 == 0) {
      FUN_005fe742(&DAT_007b4078,s__mtBlowfishCipherModule__deciphe_007b7c80);
      return 0;
    }
  }
  else if (*param_5 < param_3) {
    FUN_005fe742(&DAT_007b4078,s__mtBlowfishCipherModule__deciphe_007b7c48);
    return 0;
  }
  puVar9 = (undefined4 *)*piVar3;
  for (uVar7 = param_3 >> 2; uVar7 != 0; uVar7 = uVar7 - 1) {
    *puVar9 = *param_2;
    param_2 = param_2 + 1;
    puVar9 = puVar9 + 1;
  }
  for (uVar7 = param_3 & 3; uVar7 != 0; uVar7 = uVar7 - 1) {
    *(undefined1 *)puVar9 = *(undefined1 *)param_2;
    param_2 = (undefined4 *)((int)param_2 + 1);
    puVar9 = (undefined4 *)((int)puVar9 + 1);
  }
  puVar8 = (uint *)*piVar3;
  for (uVar7 = param_3 >> 3; uVar7 != 0; uVar7 = uVar7 - 1) {
    puVar1 = *(uint **)(param_1 + 0xc);
    uVar2 = *(undefined4 *)(param_1 + 0x10);
    param_4 = (int *)puVar8[1];
    param_2 = (undefined4 *)(puVar1[0x11] ^ *puVar8);
    uVar5 = FUN_00613f20(uVar2,&param_2);
    param_4 = (int *)((uint)param_4 ^ uVar5 ^ puVar1[0x10]);
    uVar5 = FUN_00613f20(uVar2,&param_4);
    param_2 = (undefined4 *)((uint)param_2 ^ uVar5 ^ puVar1[0xf]);
    uVar5 = FUN_00613f20(uVar2,&param_2);
    param_4 = (int *)((uint)param_4 ^ uVar5 ^ puVar1[0xe]);
    uVar5 = FUN_00613f20(uVar2,&param_4);
    param_2 = (undefined4 *)((uint)param_2 ^ uVar5 ^ puVar1[0xd]);
    uVar5 = FUN_00613f20(uVar2,&param_2);
    param_4 = (int *)((uint)param_4 ^ uVar5 ^ puVar1[0xc]);
    uVar5 = FUN_00613f20(uVar2,&param_4);
    param_2 = (undefined4 *)((uint)param_2 ^ uVar5 ^ puVar1[0xb]);
    uVar5 = FUN_00613f20(uVar2,&param_2);
    param_4 = (int *)((uint)param_4 ^ uVar5 ^ puVar1[10]);
    uVar5 = FUN_00613f20(uVar2,&param_4);
    param_2 = (undefined4 *)((uint)param_2 ^ uVar5 ^ puVar1[9]);
    uVar5 = FUN_00613f20(uVar2,&param_2);
    param_4 = (int *)((uint)param_4 ^ uVar5 ^ puVar1[8]);
    uVar5 = FUN_00613f20(uVar2,&param_4);
    param_2 = (undefined4 *)((uint)param_2 ^ uVar5 ^ puVar1[7]);
    uVar5 = FUN_00613f20(uVar2,&param_2);
    param_4 = (int *)((uint)param_4 ^ uVar5 ^ puVar1[6]);
    uVar5 = FUN_00613f20(uVar2,&param_4);
    param_2 = (undefined4 *)((uint)param_2 ^ uVar5 ^ puVar1[5]);
    uVar5 = FUN_00613f20(uVar2,&param_2);
    param_4 = (int *)((uint)param_4 ^ uVar5 ^ puVar1[4]);
    uVar5 = FUN_00613f20(uVar2,&param_4);
    param_2 = (undefined4 *)((uint)param_2 ^ uVar5 ^ puVar1[3]);
    uVar5 = FUN_00613f20(uVar2,&param_2);
    param_4 = (int *)((uint)param_4 ^ uVar5 ^ puVar1[2]);
    uVar6 = FUN_00613f20(uVar2,&param_4);
    uVar5 = puVar1[1];
    *puVar8 = (uint)param_4 ^ *puVar1;
    puVar8[1] = (uint)param_2 ^ uVar6 ^ uVar5;
    puVar8 = puVar8 + 2;
  }
  *param_5 = param_3;
  return 1;
}



undefined4 FUN_00613ad0(int *param_1,int *param_2,int param_3,uint param_4)

{
  uint *puVar1;
  int *piVar2;
  byte *pbVar3;
  byte *pbVar4;
  undefined4 *puVar5;
  undefined4 *puVar6;
  uint uVar7;
  int iVar8;
  int iVar9;
  undefined4 *puVar10;
  
  piVar2 = param_2;
  if (DAT_03350932 == '\0') {
    pbVar3 = (byte *)&DAT_007b6ae4;
    iVar8 = 0x48;
    do {
      *pbVar3 = *pbVar3 ^ 0x91;
      pbVar3 = pbVar3 + 1;
      iVar8 = iVar8 + -1;
    } while (iVar8 != 0);
    pbVar3 = (byte *)&DAT_007b6ba8;
    do {
      iVar8 = 0x400;
      pbVar4 = pbVar3;
      do {
        *pbVar4 = *pbVar4 ^ 0x91;
        pbVar4 = pbVar4 + 1;
        iVar8 = iVar8 + -1;
      } while (iVar8 != 0);
      pbVar3 = pbVar3 + 0x400;
    } while ((int)pbVar3 < 0x7b7ba8);
    DAT_03350932 = '\x01';
  }
  iVar9 = 0;
  puVar5 = &DAT_007b6ae4;
  puVar10 = (undefined4 *)*param_1;
  for (iVar8 = 0x12; iVar8 != 0; iVar8 = iVar8 + -1) {
    *puVar10 = *puVar5;
    puVar5 = puVar5 + 1;
    puVar10 = puVar10 + 1;
  }
  puVar5 = &DAT_007b6ba8;
  do {
    puVar6 = puVar5 + 0x100;
    puVar10 = (undefined4 *)(iVar9 + *param_2);
    iVar9 = iVar9 + 4;
    puVar10 = (undefined4 *)*puVar10;
    for (iVar8 = 0x100; iVar8 != 0; iVar8 = iVar8 + -1) {
      *puVar10 = *puVar5;
      puVar5 = puVar5 + 1;
      puVar10 = puVar10 + 1;
    }
    puVar5 = puVar6;
  } while ((int)puVar6 < 0x7b7ba8);
  iVar8 = 0;
  param_4 = param_4 & 0xffff;
  iVar9 = 0;
  do {
    param_2 = (int *)CONCAT31(CONCAT21(CONCAT11(*(undefined1 *)(iVar8 + param_3),
                                                *(undefined1 *)
                                                 ((iVar8 + 1) % (int)param_4 + param_3)),
                                       *(undefined1 *)((iVar8 + 2) % (int)param_4 + param_3)),
                              *(undefined1 *)((iVar8 + 3) % (int)param_4 + param_3));
    *(uint *)(*param_1 + iVar9) = *(uint *)(*param_1 + iVar9) ^ (uint)param_2;
    iVar9 = iVar9 + 4;
    iVar8 = (iVar8 + 4) % (int)param_4;
  } while (iVar9 < 0x48);
  uVar7 = 0;
  param_4 = 0;
  iVar8 = 0;
  do {
    iVar9 = *piVar2;
    puVar1 = (uint *)*param_1;
    param_2 = (int *)param_4;
    param_4 = *puVar1 ^ uVar7;
    uVar7 = FUN_00613f20(iVar9,&param_4);
    param_2 = (int *)((uint)param_2 ^ uVar7 ^ puVar1[1]);
    uVar7 = FUN_00613f20(iVar9,&param_2);
    param_4 = param_4 ^ uVar7 ^ puVar1[2];
    uVar7 = FUN_00613f20(iVar9,&param_4);
    param_2 = (int *)((uint)param_2 ^ uVar7 ^ puVar1[3]);
    uVar7 = FUN_00613f20(iVar9,&param_2);
    param_4 = param_4 ^ uVar7 ^ puVar1[4];
    uVar7 = FUN_00613f20(iVar9,&param_4);
    param_2 = (int *)((uint)param_2 ^ uVar7 ^ puVar1[5]);
    uVar7 = FUN_00613f20(iVar9,&param_2);
    param_4 = param_4 ^ uVar7 ^ puVar1[6];
    uVar7 = FUN_00613f20(iVar9,&param_4);
    param_2 = (int *)((uint)param_2 ^ uVar7 ^ puVar1[7]);
    uVar7 = FUN_00613f20(iVar9,&param_2);
    param_4 = param_4 ^ uVar7 ^ puVar1[8];
    FUN_00613f60(puVar1,iVar9,&param_2,&param_4,9);
    FUN_00613f60(puVar1,iVar9,&param_4,&param_2,10);
    FUN_00613f60(puVar1,iVar9,&param_2,&param_4,0xb);
    FUN_00613f60(puVar1,iVar9,&param_4,&param_2,0xc);
    FUN_00613f60(puVar1,iVar9,&param_2,&param_4,0xd);
    FUN_00613f60(puVar1,iVar9,&param_4,&param_2,0xe);
    FUN_00613f60(puVar1,iVar9,&param_2,&param_4,0xf);
    FUN_00613f60(puVar1,iVar9,&param_4,&param_2,0x10);
    uVar7 = (uint)param_2 ^ puVar1[0x11];
    *(uint *)(*param_1 + iVar8) = uVar7;
    *(uint *)(*param_1 + 4 + iVar8) = param_4;
    iVar8 = iVar8 + 8;
  } while (iVar8 < 0x48);
  param_3 = 0;
  do {
    iVar8 = 0;
    do {
      iVar9 = *piVar2;
      puVar1 = (uint *)*param_1;
      param_2 = (int *)param_4;
      param_4 = uVar7 ^ *puVar1;
      uVar7 = FUN_00613f20(iVar9,&param_4);
      param_2 = (int *)((uint)param_2 ^ uVar7 ^ puVar1[1]);
      FUN_00613f60(puVar1,iVar9,&param_4,&param_2,2);
      FUN_00613f60(puVar1,iVar9,&param_2,&param_4,3);
      FUN_00613f60(puVar1,iVar9,&param_4,&param_2,4);
      FUN_00613f60(puVar1,iVar9,&param_2,&param_4,5);
      FUN_00613f60(puVar1,iVar9,&param_4,&param_2,6);
      FUN_00613f60(puVar1,iVar9,&param_2,&param_4,7);
      FUN_00613f60(puVar1,iVar9,&param_4,&param_2,8);
      FUN_00613f60(puVar1,iVar9,&param_2,&param_4,9);
      FUN_00613f60(puVar1,iVar9,&param_4,&param_2,10);
      FUN_00613f60(puVar1,iVar9,&param_2,&param_4,0xb);
      FUN_00613f60(puVar1,iVar9,&param_4,&param_2,0xc);
      FUN_00613f60(puVar1,iVar9,&param_2,&param_4,0xd);
      FUN_00613f60(puVar1,iVar9,&param_4,&param_2,0xe);
      FUN_00613f60(puVar1,iVar9,&param_2,&param_4,0xf);
      FUN_00613f60(puVar1,iVar9,&param_4,&param_2,0x10);
      uVar7 = (uint)param_2 ^ puVar1[0x11];
      iVar8 = iVar8 + 8;
      *(uint *)(*(int *)(param_3 + *piVar2) + -8 + iVar8) = uVar7;
      *(uint *)(*(int *)(param_3 + *piVar2) + -4 + iVar8) = param_4;
    } while (iVar8 < 0x400);
    param_3 = param_3 + 4;
  } while (param_3 < 0x10);
  return CONCAT31((int3)(uVar7 >> 8),1);
}


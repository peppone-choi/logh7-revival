
undefined1 * __thiscall
FUN_004aca80(int param_1,undefined4 param_2,undefined4 *param_3,int *param_4,undefined4 param_5)

{
  int iVar1;
  int *piVar2;
  undefined1 *puVar3;
  int *piVar4;
  int iVar5;
  undefined4 *puVar6;
  undefined4 *puVar7;
  undefined4 *puVar8;
  undefined4 uStack_48;
  int *piStack_44;
  undefined4 local_30;
  undefined1 local_2c [8];
  int local_24;
  int *local_20;
  undefined4 local_1c;
  void *pvStack_18;
  undefined1 uStack_10;
  void *pvStack_c;
  undefined1 *puStack_8;
  undefined4 *local_4;
  
  iVar1 = (int)param_3;
  local_4 = (undefined4 *)0xffffffff;
  puStack_8 = &LAB_006621b8;
  pvStack_c = ExceptionList;
  puVar6 = *(undefined4 **)(param_1 + 8);
  puVar7 = (undefined4 *)*puVar6;
  local_30 = 0;
  puVar8 = puVar6;
  if (param_3 != (undefined4 *)0xffffffff) {
    for (; (puVar8 = puVar7, puVar7 != puVar6 && ((int)puVar7[2] < (int)param_3));
        puVar7 = (undefined4 *)*puVar7) {
    }
  }
  piStack_44 = (int *)0xc;
  uStack_48 = 0x4acacf;
  ExceptionList = &pvStack_c;
  piVar4 = (int *)FUN_00648d42();
  uStack_48 = 4;
  *piVar4 = param_1;
  iVar5 = FUN_00648d42();
  piVar4[1] = iVar5;
  piVar4[2] = (int)&LAB_004acff0;
  uStack_48 = 0x4acaf1;
  piStack_44 = piVar4;
  FUN_004ae610();
  local_4 = (undefined4 *)0x1;
  piStack_44 = (int *)0x4acb02;
  FUN_004aea20();
  piVar2 = param_4;
  piStack_44 = (int *)local_2c;
  local_24 = iVar1;
  local_4 = (undefined4 *)CONCAT31(local_4._1_3_,2);
  local_20 = param_4;
  local_1c = param_5;
  uStack_48 = 0x4acb29;
  FUN_004ae670();
  param_3 = &uStack_48;
  FUN_004ae640(local_2c);
  puVar6 = (undefined4 *)(**(code **)(*piVar2 + 4))(&param_3);
  local_24 = *puVar6;
  local_4 = (undefined4 *)puVar8[1];
  puVar7 = (undefined4 *)FUN_00648d42(0x20);
  puVar6 = puVar8;
  if (puVar8 == (undefined4 *)0x0) {
    puVar6 = puVar7;
  }
  *puVar7 = puVar6;
  if (local_4 == (undefined4 *)0x0) {
    local_4 = puVar7;
  }
  puVar7[1] = local_4;
  puVar8[1] = puVar7;
  local_4 = puVar7 + 2;
  *(undefined4 **)puVar7[1] = puVar7;
  uStack_10 = 3;
  if (local_4 != (undefined4 *)0x0) {
    FUN_004ad050(&local_30);
  }
  puVar3 = puStack_8;
  *(int *)(param_1 + 0xc) = *(int *)(param_1 + 0xc) + 1;
  uStack_10 = 2;
  *(undefined4 **)piVar4[1] = puVar7;
  FUN_004ae640(&stack0xffffffc8);
  uStack_10 = 1;
  thunk_FUN_004ae700();
  uStack_10 = 0;
  thunk_FUN_004ae700();
  ExceptionList = pvStack_18;
  return puVar3;
}


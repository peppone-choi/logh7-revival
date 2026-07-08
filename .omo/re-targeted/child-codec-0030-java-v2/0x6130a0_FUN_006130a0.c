
int * FUN_006130a0(int param_1,int *param_2)

{
  int *piVar1;
  int iVar2;
  int iVar3;
  int iVar4;
  char cVar5;
  u_short uVar6;
  int *piVar7;
  int *piVar8;
  undefined2 extraout_var;
  undefined4 unaff_EBX;
  int unaff_EDI;
  int iStack_8;
  int iStack_4;
  
  piVar7 = param_2;
  iVar4 = param_1;
  if (param_2 == (int *)0x0) {
    piVar7 = (int *)FUN_00614ba0(param_1);
    return piVar7;
  }
  piVar8 = (int *)FUN_00614ba0(param_1);
  if (piVar8 == (int *)0x0) {
    return (int *)0x0;
  }
  piVar8[1] = piVar8[1] + (uint)*(ushort *)((int)piVar7 + 0x12);
  FUN_00614c70(piVar8,&param_2);
  if ((ushort)param_2 != 0x30) {
    piVar8[1] = *piVar8;
    iVar2 = piVar7[5];
    if (iVar2 != 0) {
      iVar3 = *(int *)(iVar2 + 4);
      param_1 = FUN_00613920(&param_2);
      if ((param_1 == *(int *)(iVar2 + 4)) || ((ushort)param_2 < *(ushort *)(param_1 + 0xc))) {
        iStack_4 = *(int *)(iVar2 + 4);
        piVar7 = &iStack_4;
      }
      else {
        piVar7 = &param_1;
      }
      if (*piVar7 != iVar3) {
        return piVar8;
      }
    }
    FUN_00614bb0(iVar4);
    FUN_00614b30(iVar4);
    return (int *)0x0;
  }
  iStack_8 = piVar7[7];
  piVar1 = piVar7 + 6;
  cVar5 = (**(code **)(*(int *)*piVar7 + 0x18))
                    (piVar8[1],
                     ((uint)*(ushort *)(piVar8 + 2) - (uint)*(ushort *)((int)piVar7 + 0x12)) + -2,
                     piVar1,&iStack_8);
  if (cVar5 == '\0') {
    FUN_00614bb0(unaff_EBX);
    FUN_00614b30(unaff_EBX);
    return (int *)0x0;
  }
  FUN_00614bb0(unaff_EBX);
  uVar6 = ntohs(*(u_short *)((uint)*(ushort *)((int)piVar7 + 0x12) + *piVar1));
  iStack_8 = CONCAT22(extraout_var,uVar6);
  if (uVar6 == 0x31) {
    iVar4 = *piVar7;
    cVar5 = (**(code **)(**(int **)(iVar4 + 0xc) + 4))
                      (*(ushort *)((int)piVar7 + 0x12) + 2 + *piVar1,
                       (unaff_EDI - CONCAT22(extraout_var,*(ushort *)((int)piVar7 + 0x12))) + -2);
    if (cVar5 != '\0') {
      *(undefined4 *)(iVar4 + 0x20) = 0;
    }
    piVar7 = (int *)FUN_006130a0(unaff_EBX,piVar7);
    return piVar7;
  }
  piVar7[10] = *piVar1;
  *(undefined1 *)(piVar7 + 0xc) = 1;
  *(short *)(piVar7 + 0xb) = (short)unaff_EDI;
  piVar7[9] = *piVar1;
  return piVar7 + 9;
}


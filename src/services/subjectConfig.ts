export const CORE_SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物'] as const;
export type CoreSubject = (typeof CORE_SUBJECTS)[number];

export const AUXILIARY_SUBJECTS = ['历史', '政治', '地理'] as const;
export type AuxiliarySubject = (typeof AUXILIARY_SUBJECTS)[number];

export const SUBJECT_DISPLAY_OPTIONS = [
  '自动识别', ...CORE_SUBJECTS, ...AUXILIARY_SUBJECTS,
] as const;

export type DisplaySubject = (typeof SUBJECT_DISPLAY_OPTIONS)[number];

export const EXAM_TYPE_DISPLAY_OPTIONS = [
  '自动识别', '课后小测', '周测', '单元测', '月考', '期中', '期末',
  '一模', '二模', '三模', '中考', '高考', '自定义',
] as const;

export type DisplayExamType = (typeof EXAM_TYPE_DISPLAY_OPTIONS)[number];

export const SUBJECT_SCOPE_NOTICE =
  '当前版本聚焦初高中家教场景，重点支持语文、数学、英语、物理、化学、生物，辅助支持历史、政治与地理。';

export const UNSUPPORTED_SUBJECT_NOTICE =
  '当前资料不属于初高中家教学科范围，系统不会生成跨学科兜底题。请重新上传资料或手动选择对应学科。';

export function isCoreSubject(subject: string): boolean {
  return CORE_SUBJECTS.includes(subject as CoreSubject);
}

export function isAuxiliarySubject(subject: string): boolean {
  return AUXILIARY_SUBJECTS.includes(subject as AuxiliarySubject);
}

export function isSupportedDisplaySubject(subject: string): boolean {
  return SUBJECT_DISPLAY_OPTIONS.includes(subject as DisplaySubject);
}

export function isSupportedDisplayExamType(examType: string): boolean {
  return EXAM_TYPE_DISPLAY_OPTIONS.includes(examType as DisplayExamType);
}

export function getSubjectSupportLevel(subject: string): 'core' | 'auxiliary' | 'unsupported' {
  if (isCoreSubject(subject)) return 'core';
  if (isAuxiliarySubject(subject)) return 'auxiliary';
  return 'unsupported';
}

/**
 * 将 UI 中 '自动识别' 或空值解析为真实学科。
 * @param selectedSubject - UI 选择的学科（可能为 '自动识别' 或 'Auto' 或空）
 * @param detectedSubject - inferSubjectType 检测到的学科
 * @returns 解析后的真实学科
 */
export function resolveActualSubject(
  selectedSubject: string | undefined | null,
  detectedSubject: string
): string {
  const autoValues = ['自动识别', 'Auto', 'auto', '', 'autodetect'];
  if (!selectedSubject || autoValues.includes(selectedSubject)) {
    // 用检测到的学科
    if (isCoreSubject(detectedSubject) || isAuxiliarySubject(detectedSubject)) {
      return detectedSubject;
    }
    return '自动识别';
  }
  // 手动选择的学科
  if (isCoreSubject(selectedSubject) || isAuxiliarySubject(selectedSubject)) {
    return selectedSubject;
  }
  return '自动识别';
}

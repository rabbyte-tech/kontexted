export const parseId = (value: unknown) => {
  const id = typeof value === "string" ? Number(value) : Number(value)
  if (!Number.isFinite(id) || id <= 0) {
    return null
  }
  return id
}

export const parsePublicId = (value: unknown) => {
  if (typeof value !== "string") {
    return null
  }
  const cuidRegex = /^[a-z0-9]{24}$/i
  if (!cuidRegex.test(value)) {
    return null
  }
  return value
}

export const parseSlug = (value: unknown) => {
  if (typeof value !== "string") {
    return null
  }
  const slugRegex = /^[a-z0-9-]+$/
  if (!slugRegex.test(value) || value.length === 0) {
    return null
  }
  return value
}

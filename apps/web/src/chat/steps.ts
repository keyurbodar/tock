const labels: Record<string, [running: string, done: string]> = {
  memory_search: ["Searching memory", "Searched memory"],
  memory_save: ["Saving to memory", "Saved to memory"],
  codemode: ["Running code", "Ran code"],
  http_request: ["Fetching", "Fetched"],
  file_read: ["Reading a file", "Read a file"],
  file_write: ["Writing a file", "Wrote a file"],
  file_list: ["Looking at files", "Looked at files"],
  spawn_subagent: ["Starting a helper", "Helper finished"],
  schedule_followup: ["Scheduling a follow-up", "Scheduled a follow-up"],
  notify_owner: ["Sending you a note", "Sent you a note"],
  mcp_call: ["Using an app", "Used an app"],
  mcp_discover: ["Looking at apps", "Looked at apps"],
}

export function stepLabel(name: string, running: boolean): string {
  const pair = labels[name]
  if (pair) return running ? pair[0] : pair[1]
  const words = name.replace(/[_-]+/g, " ")
  return running ? `Using ${words}` : `Used ${words}`
}

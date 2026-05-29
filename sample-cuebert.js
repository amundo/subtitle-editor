let filename = Deno.args[0]
let json = Deno.readTextFileSync(`./${filename}`)
let data = JSON.parse(json)
data.segments = data.segments.slice(0,3)
Deno.writeTextFileSync(`${filename.replace(`.cuebert.json`,``)}.cuebert.sample.json`, JSON.stringify(data, null, 2))

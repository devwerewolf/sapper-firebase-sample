const yaml = require('js-yaml');

module.exports = {
  getEverythingFromDiscord: async function (serverID, client) {
    const guild = await client.guilds.fetch(serverID);
    const channels = guild.channels.cache;
    
    const getChannel = (name = "") => channels.find((channel) => channel.name === name);
    
    const gameChannels = {
      create: getChannel("create"),
      update: getChannel("update"),
    }
    
    // Moonscript segments
    let moonscriptSegments = {
      create: "",
      update: "",
    }
    
    const fillMoonscriptSegment = async (segmentName = "") => {
      const channel = gameChannels[segmentName];
      
      if (channel) {
        const messages = await channel.messages.fetch();
        const ownerMessages = messages.filter((message) => message.author.id === guild.ownerID);
        const moonMessages = [];
        
        ownerMessages.forEach((message) => {
          moonMessages.push(extractMoonscript(message.content) + "\n");
        });
        
        const fullMoon = moonMessages.reverse().join("\n")
        moonscriptSegments[segmentName] = fullMoon;
      }
    }
    
    const exportEveryClass = (segmentName = "") => {
      const classPattern = /^class/gm
      moonscriptSegments[segmentName] = moonscriptSegments[segmentName].replace(classPattern, "export class");
    }
    
    const segmentNames = Object.keys(moonscriptSegments);
    
    for (let segmentName of segmentNames) {
      await fillMoonscriptSegment(segmentName);
      exportEveryClass(segmentName)
    }
    
    // Assets
    let assets = [];
    const assetsChannel = getChannel("assets");
    
    if (assetsChannel) {
      const messages = await assetsChannel.messages.fetch();
      const ownerMessages = messages.filter((message) => message.author.id === guild.ownerID);
      
      ownerMessages.forEach((message) => {
        // Sprite sheets
        const config = yaml.load(extractYaml(message.content));
        const className = config["class name"] || config["class_name"];
        const frameWidth = config["frame width"] || config["frame_width"];
        const frameHeight = config["frame height"] || config["frame_height"];
        const frameRate = config["frame rate"] || config["frame_rate"];
        const { animations = [] } = config;
        
        const preview = message.attachments.values().next().value || message.embeds[0];
        const extension = preview.url.split(".").pop();
        const type = extension === "ogg" ? "sound" : "image";
        
        const url = preview.proxyURL || preview.thumbnail.proxyURL;
        
        assets.push({
          name: className,
          url,
          frameWidth,
          frameHeight,
          frameRate,
          animations,
          type,
          extension
        });
      });
      
      assets.reverse();
    }
    
    return { moonscriptSegments, assets };
  }
}

function extractMoonscript(content = "") {
  const codeFenceMarkdown = "```";
  const moonscriptPrefix = new RegExp(codeFenceMarkdown + "(moonscript|moon)", "g");
  const codeSplit = content.split(moonscriptPrefix)[2];
  const moonscript = codeSplit.slice(0, -codeFenceMarkdown.length).trim();
  return moonscript;
}

function extractYaml(content = "") {
  const codeFenceMarkdown = "```";
  const yamlPrefix = new RegExp(codeFenceMarkdown + "(yaml)", "g");
  const codeSplit = content.split(yamlPrefix)[2];
  const yaml = codeSplit.slice(0, -codeFenceMarkdown.length).trim();
  return yaml;
}
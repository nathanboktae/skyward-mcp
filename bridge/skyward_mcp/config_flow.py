"""One confirmation, no credentials to copy between components."""
import voluptuous as vol
from homeassistant import config_entries
from . import DOMAIN, read_backend

class SkywardConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        if user_input is not None:
            try:
                await self.hass.async_add_executor_job(read_backend)
            except (OSError, ValueError, KeyError):
                return self.async_abort(reason='missing_app')
            return self.async_create_entry(title='Skyward MCP', data={})
        return self.async_show_form(step_id='user', data_schema=vol.Schema({}))

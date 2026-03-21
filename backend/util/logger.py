import logging
from datetime import datetime

def setup_logger(name, log_file=None, level=logging.INFO):
    """Create a logger with timestamp formatting"""
    
    # Create logger
    logger = logging.getLogger(name)
    logger.setLevel(level)
    
    # Create formatter with timestamp including milliseconds
    formatter = logging.Formatter(
        '%(asctime)s.%(msecs)03d - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    # Optional: File handler
    if log_file:
        file_handler = logging.FileHandler(log_file)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    
    return logger
